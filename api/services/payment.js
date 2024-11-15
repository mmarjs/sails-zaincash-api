var soap = require('soap');
var jwt = require('jsonwebtoken');

module.exports.domesticTransfer = function (initialCallback, data, phonenumber, pin, takeFees) {
    var transaction;
    async.waterfall([
        function(callback) {
            savePendingTransaction(callback, data);
        }, function (trans, callback) {

            transaction = trans;
            soapInit(callback);
        }, function (client, callback) {
            sourceOfFundRequest(callback, client, phonenumber, pin);
        }, function (body, callback) {
            parseSOFId(callback, body, transaction);
        }, function (callback) {
            soapMerchantInit(callback);
        }, function (client, callback) {
            if (takeFees == true) {
                getFees(callback, client, data.amount, pin, phonenumber, transaction, 'DOMESTIC_TRANSFER');
            } else {
                return callback(null, client);
            }
        }, function (client, callback) {
            transfer(callback, client, phonenumber, pin, transaction);
        }, function (response, callback) {
            completeTransaction(callback, response, transaction);
        }, function (response, callback) {
            return initialCallback(null, { success: 1, transaction: transaction });
        }
    ], function (err) {
        updateFailedTransaction(transaction, err.msg);
        return initialCallback(null, { success: 0, msg: err.msg, details: err.details, transaction: transaction });
    });

}


module.exports.domesticTransferReversal = function (initialCallback, transaction, reversalData, phonenumber, pin, extraData) {
    var reversalTransaction;
    async.waterfall([
        function (callback) {
            savePendingTransaction(callback, reversalData);
        }, function (trans, callback) {
            reversalTransaction = trans;
            soapMerchantInit(callback);
        }, function (client, callback) {
            domesticTransferReversalRequest(callback, client, phonenumber, pin, transaction, reversalData.comment);
        }, function (data, callback) {
            completeReversalTransaction(callback, data, reversalTransaction);
        }, function (callback) {
            return initialCallback(null, { success: 1, transaction: reversalTransaction, extraData: extraData });
        }
    ], function (err) {
        updateFailedTransaction(reversalTransaction, err.msg);
        initialCallback(null, { success: 0, msg: err.msg, details: err.details, transaction:  reversalTransaction, parentTransaction: transaction,  extraData: extraData });
    });
}

module.exports.paymentTrigger = function(transaction) {

    var url = sails.config.connections.paymentTriggerUrl;
    sails.log.info('payment Trigger url: ' + url);
    jwt.sign(transaction, sails.config.connections.paymentTriggerSecretKey, {expiresIn: '15min'}, function (err, token) {
        if (err) {
            sails.log.error('Payment Trigger Token could not be created', err);
        } else {
            sails.log.info('Payment trigger token: ' + token);
            utils.performRequest('post', url, {jwt: token}, function (err, httpResponse, body) {
              sails.log.info('payment trigger body: ' + body);
                if (err) {
                    sails.log.error('Error returned from Zain Cash Payment URL: ', err);
                } else {
                    sails.log.info('Body returned from Zain Cash Payment URL: ' , body);
                }
            });
        }
    });
}

/**
 * Calls ESERV API to reverse domestic transfer transaction
 *
 *
 * @param {function} callback
 * @param {object} client
 * @param {number} phonenumber
 * @param {string} pin
 *
 * @returns {function}
 */
function domesticTransferReversalRequest(callback, client, phonenumber, pin, parentTransaction, comment) {

    esj.domesticTransferReversalRequest.payload.requester.accessValue = phonenumber;
    esj.domesticTransferReversalRequest.payload.requester.password = pin.toString();
    esj.domesticTransferReversalRequest.payload.operationId = parentTransaction.operationId;
    esj.domesticTransferReversalRequest.payload.comment = comment;
    sails.log.info('DOMESTIC_TRANSFER_REVERSAL|' + phonenumber + '|' + parentTransaction.operationId + '|' + comment);
    sails.log.info('DOMESTIC_TRANSFER_REVERSAL request' + JSON.stringify(esj.domesticTransferReversalRequest));
    client.domesticTransferReversal(esj.domesticTransferReversalRequest, function (err, result, body) {
      sails.log.info("Body: " + JSON.stringify(body));
        if (err) {
            esj.parseTncErrors(body, function (error, errorValue) {
                return callback({msg: error ? error : errorValue});
            });
        } else {
            esj.parseDomesticTransferReversal(body, function (error, data) {
                if (error) {
                    return callback({ msg: error });
                }

                return callback(null, data);
            });
        }
    }, { timeout: esj.requestTimeOut });
}

/**
 * Update failed transaction
 *
 * @param {object} transaction
 * @param {string} error
 */
function updateFailedTransaction(transaction, error) {
    transaction.status = 'failed';
    transaction.due  = error;

    try {
        transaction.save(function (err) {
            if (err) {
                sails.log.error('UPDATE_FAILED_TRANSACTION_FAILED| ' + transaction.operationId, err);
            }
        });
    } catch (err) {
        sails.log.error('UPDATE_FAILED_TRANSACTION_FAILED| ' + transaction.operationId, err);
    }
}

/**
 * Build Transaction Reversal Filter
 *
 * @param {string} transactionId
 * @param {string} merchantId
 * @param {number} merchantPhone
 *
 * @returns {object}
 */
function transactionReversalFilter(transactionId, merchantId, merchantPhone) {
    var filter = {
        $and: [
            {
                $or: [
                    {
                        to: merchantId
                    },
                    {
                        transfer_to: merchantPhone
                    }
                ]
            },
            {
                id: transactionId,
                status: 'completed'
            }
        ]
    };

    return filter;
}

/**
 * Check if Transaction exists based on filter
 *
 * @param {function} callback
 * @param {object} filter
 *
 * @returns {function}
 */
function validateTransaction(callback, filter) {

    Transactions.findOne(filter, function (err, trans) {
        if (err || !trans) {
            return callback({msg: "invalid_transaction_id"});
        }

        if (!trans.from) {
            return callback({msg: "unknown_zain_cash_receiver"});
        }

        if (!trans.amount || trans.amount < sails.config.connections.minAmount) {
            return callback({msg: "transaction_amount_cannot_be_refund"});
        }

        if (trans.status !== "completed" || !trans.operationId) {
            return callback({msg: "transaction_is_not_completed"});
        }

        return callback(null, trans);
    });
}

/**
 * Validate Merchant ID
 *
 * @param {function} callback
 * @param {string} merchantId
 *
 * @returns {function}
 */
function validateMerchant(callback, merchantId, merchantPhone) {
    if (!merchantId || !merchantPhone) {
        return callback({ msg: 'merchant_id_and_phone_are_required' });
    }

    Merchants.findOne({ id: merchantId, deleted: false}, function (err, merchant) {
        if (err) {
            return callback({ msg: 'invalid_merchant_id' });
        }

        return callback(null, merchant);
    });
}

/**
 * Save Domestic Tranfer Transaction as Pending
 *
 * @param {function} callback
 * @param {object} data
 *
 * @returns {function}
 */
function savePendingTransaction(callback, data) {
    Transactions.create(data).exec(function (err, trans) {
        if (err) {
            return callback({ msg: 'missing_or_invalid_parameters', details: err.details });
        }
        sails.log.info('Pending transaction saved');
        return callback(null, trans);
    });
}

/**
 * Initialize Source Of fund Soap Client
 *
 * @param {fuction} callback
 *
 * @returns {function}
 */
function soapInit(callback) {
    soap.createClient(sails.config.connections.sourceoffundUrl, function (err, client) {
        if (err) {
            return callback({ msg: 'soap_connection_error' });
        }

        return callback(null, client);
    });
}

/**
 * Initialize Merchant Soap client
 *
 * @param {function} callback
 *
 * @returns {function}
 */
function soapMerchantInit(callback) {
    soap.createClient(sails.config.connections.merchantPaymentUrl, function (err, client) {
        if (err) {
            return callback({ msg: 'soap_connection_error' });
        }

        return callback(null, client);
    });
}

/**
 * Updatee Transaction To completed - save the Operation ID and the new balance returned from ESERV
 *
 *
 * @param {function} callback
 * @param {object} data
 *
 * @returns {function}
 */
function completeTransaction(callback, data, transaction) {
    transaction.status      = "completed";
    transaction.operationId = data.operationId.toString();
    transaction.operationDate = new Date(parseInt(data.operationDate));
    transaction.newBalance  = data.newbalance;
    transaction.creditedNewBalance = data['creditedNewBalance'];
    transaction.operationDate = typeof data.operationDate != "undefined" ? new Date(parseInt(data.operationDate)) : new Date();

    try {
      payment.paymentTrigger(transaction);
    } catch (error) {
      sails.log.error("PAYMENT_SERVICE_FAILED_TO_CALL_PAYMENT_TRIGGER_API", error);
    }

    transaction.save(function (err) {
        if (err) {
            return callback({ msg: 'transaction_completion_error', details: err });
        }

        return callback(null, data);
    });
}

/**
 * Update Reversal Transaction to completed and set the reversed field
 * in parent transaction to true
 *
 * @param {function} callback
 * @param {object} data
 *
 * @returns {function}
 */
function completeReversalTransaction(callback, data, reversalTransaction) {
    reversalTransaction.status = 'completed';
    reversalTransaction.comment = data.comment;
    reversalTransaction.operationId = data.operationId.toString();
    reversalTransaction.operationDate = new Date(data.operationDate);

    reversalTransaction.save(function (err) {
        if (err) {
            return callback({ msg: 'transaction_completion_error', details: err });
        }

        transaction.reversed = true;
        transaction.save(function (err) {
            return callback(null);
        });
    });
}

/**
 * Get the eligible SOF ID of the user
 *
 * @param {function} callback
 * @param {object} client
 * @param {string} phonenumber
 * @param {string} pin
 *
 * @returns {function}
 */
function sourceOfFundRequest(callback, client, phonenumber, pin) {
    sails.log.info('SOURCE_OF_FUND_REQUEST| ' + phonenumber);
    //pouplate parameters
    var request = esj.getSourceOfFundRequest(false);
    request.payload.requester.accessValue = phonenumber;
    request.payload.requester.password    = pin;
    request.payload.requester.accessMedium = "USSD"

    // initiate the getMyEligibleSof API
    sails.log.info('initiate the getMyEligibleSoF API');
    sails.log.info(JSON.stringify(request));
    client.getMyEligibleSoF(request, function (err, result, body) {
      sails.log.info("Body: " + JSON.stringify(body));
        if (err) {
            esj.parseTncErrors(body, function (error, errorValue) {
                return callback({ msg: error ? error : errorValue });
            });
        } else {
            return callback(null, body);
        }
    }, { timeout: esj.requestTimeOut });
}

/**
 * Parse SOFId and owner SOFId
 *
 * @param {function} callback
 * @param {object} body
 *
 * @returns {function}
 */
function parseSOFId(callback, body, transaction) {
    async.parallel([
        function (callback1) {
            esj.parseSOFId(body, function (error,  id) {
                if (error) {
                    return callback1({ msg: error });
                }
                transaction.sofId = id;
                return callback1(null);
            });
        },
        function (callback2) {
            esj.parseSOFOwnerId(body, function (error, id) {
                if (error) {
                    return callback2({ msg: error });
                }

                transaction.sofOwnerId = id;
                return callback2(null);
            });
        }
    ], function (err, results) {
        if (err) {
            return callback(err);
        }

        return callback(null);
    });
}

/**
 * Compute the fees realted to the transactions
 *
 * @param {function} callback
 * @param {object} client
 * @param {object} data
 * @param {string} pin
 *
 * @returns {function}
 */
function getFees(callback, client, amount, pin, phonenumber,transaction, operationType) {
    sails.log.info('COMPUTE_SERVICE_CHARGE| ' + phonenumber + '|' + amount);
      //populate parameters
      esj.computeServiceChargeRequest.payload.requester.accessValue   = phonenumber;
      esj.computeServiceChargeRequest.payload.requester.password      = pin;
      esj.computeServiceChargeRequest.payload.amount                  = parseInt(amount + '00000');
      esj.computeServiceChargeRequest.payload.targetOperationType     = operationType;
      esj.computeServiceChargeRequest.payload.debitedActor.identifier = transaction.sofOwnerId;
      esj.computeServiceChargeRequest.payload.debitedSofId            = transaction.sofId;
      sails.log.info('computeServiceCharge API');
      sails.log.info(JSON.stringify(esj.computeServiceChargeRequest));
      client.computeServiceCharge(esj.computeServiceChargeRequest, function (err, result, body) {
            sails.log.info("Body: " + JSON.stringify(body));
            if (err) {
                esj.parseTncErrors(body, function (error,  errorValue) {
                    return error ? error : errorValue;
                });
            } else {
                esj.parseFeeValue(body, function (error, fee) {
                    if (error) {
                        return callback({ msg: error });
                    }

                    transaction.totalFees = parseInt(parseInt(fee) / 100000);
                    return callback(null);
                });
            }
      }, { timeout: esj.requestTimeOut });
}

/**
 * Transfer Money Using Domestic Transfer API
 *
 * @param {function} callback
 * @param {object} client
 * @param {object} data
 * @param {string} pin
 *
 * @returns {function}
 */
function transfer(callback, client, phonenumber, pin, transaction) {
    var comment = "";
    sails.log.info('DOMESTIC_TRANSFER_API| ' + phonenumber + '|' + transaction.amount + '|' + transaction.transfer_to);
    if(transaction.comment === 'payment_gateway'){
      comment = 'payment_gateway';
    }else{
      comment = 'DOMESTIC_TRANSFER_FROM_MOBILE';
    }
    //populate parameters
    esj.domesticTransferRequest.payload.requester.accessValue  = phonenumber;
    esj.domesticTransferRequest.payload.requester.password     = pin.toString();
    esj.domesticTransferRequest.payload.quantity               = parseInt(transaction.amount.toString() + '00000');
    esj.domesticTransferRequest.payload.debitedSofId           = transaction.sofId;
    esj.domesticTransferRequest.payload.beneficiary.identifier = transaction.transfer_to;
    esj.domesticTransferRequest.payload.comment                = comment;
    sails.log.info('domestic transfer request : ' +  JSON.stringify(esj.domesticTransferRequest));
    client.domesticTransfer(esj.domesticTransferRequest, function (err, result, body) {
      sails.log.info("Body: " + JSON.stringify(body));
        if (err) {
            esj.parseTncErrors(body, function(error, errorValue) {
                return callback({ msg: error ? error : errorValue });
            });
        } else {
            esj.parseDomesticTransfer(body, function (error, response) {
                if (error) {
                    return callback(error);
                }
                sails.log.info('Domnestic Transfer Response: ', response);
                return callback(null, response);
            });
        }
    }, { timeout: esj.requestTimeOut });
}
