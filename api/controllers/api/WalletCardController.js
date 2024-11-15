/**
 * WalletCard Controller
 *
 * @description :: Server-side for managing Wallet Card logic
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var soap = require('soap');

module.exports = {
    /**
     * Get the wallet status of the user
     */

    getActorData: function(req, res) {
	sails.log.info('wallet card reached');
        if (!req.token.phonenumber) {
            return res.json(401, {err: 'user_phonenumber_not_valid'});
        }

        async.waterfall([
            function soapInit(callback) {
                // Connect to the WSDL that contains all the APIs related to the actor
                soap.createClient(sails.config.connections.actorUrl, function (err, client) {
                  if (err)
                    return callback({msg: "soap_connection_error"});

                  return callback(null, client);
                })
            },
            // Find actor information based on msisdn
            function findPeer(client, callback) {
                // fill the params that will be sent when calling findPeer API
                esj.findPeer.payload.actorIdentifier = req.token.phonenumber;
		
		sails.log.info('Find Peer: ' + JSON.stringify(esj.findPeer));

                client.findPeer(esj.findPeer, function (err, result, body) {
                    if (err) {
                        esj.parseTncErrors(body, function (error, errorValue) {
                            sails.log('ESERV ERROR ' + error);
                            return res.json({success: 0, err: error ? error : errorValue})
                        });
                    }
                    else {
                        // Parse Actor ID returned from API
                        esj.parseActorId(body, function (error, actorId) {
                            if (error) {
                              return callback({msg: error})
                            }
                            return callback(null, actorId, client);
                        });
                    }
                });
            },
            // Get actor Details based on the retreived ID
            function getActorDetails(actorId, client, callback) {
                // fill the params that will be sent when calling actorGetDetails API
                esj.actorGetDetails.payload.actorId = actorId;

                client.actorGetDetails(esj.actorGetDetails, function (err, result, body) {
                    if (err) {
                        esj.parseTncErrors(body, function (error, errorValue) {
                            sails.log('ESERV ERROR ' + error);
                            return res.json({success: 0, err: error ? error : errorValue})
                        });
                    }
                    else {
                        // Get actor details
                        esj.parseActorData(body, function (error, actorData) {
                            if (error) {
                              return callback({msg: error})
                            }

                            return res.json({
                                success: 1,
                                actorData: actorData
                            });
                        });
                    }
                });
            }
        ],
        function (err, result) {
            return res.json({success: 0, err: err.msg});
        })
    },

   /**
   * validate pin
   *
   */
  validateUser : function (req, res) {
    sails.log.info('Pin validation reached');
    var pin = req.param('pin');
    var sofId;

    if (!req.token.phonenumber) {
        return res.json(401, {err: 'user_phonenumber_not_valid'});
    }

    if (!pin) {
      return res.json(401, {err: 'Phone and Pin are required'});
    }
    async.waterfall([
        function ValideEserv(callback) {
          soap.createClient(sails.config.connections.sourceoffundUrl, function (err, client) {
            if (err)
              return callback({msg: "soap_connection_error"})

            var request = esj.getSourceOfFundRequest(false)
            request.payload.requester.accessValue = req.token.phonenumber.toString();
            request.payload.requester.password = pin.toString();

            //initiate the getMyEligibleSoF API
            client.getMyEligibleSoF(request, function (err, result, body) {
              if (err)
                esj.parseTncErrors(body, function (error, errorValue) {
                  return callback({msg: error ? error : errorValue})
                })
              else
                esj.parseSOFId(body, function (error, id) {
                  if (error)
                    return callback({msg: error})

                  sofId = id
                  return res.json({sofId:sofId,success:1});
                })
            }, {timeout: esj.requestTimeOut})
          })
        },
      ],
      function (err) {
        if (err) {
          err.msg = err.msg != undefined ? err.msg : "unknown_error"
          sails.log('ESERV ERROR ' + err.msg)
          return res.json(401, {err: err.msg});
        }
        return res.serverError()
      }
    );
  },

  /**
   * Transfer Amount to switch wallet
   */
  transferAmount: function(req, res) {
    var params = req.params.all()
    var transaction, merchantObj

    sails.log.info('Received params: ' + JSON.stringify(params));
    // validate received params
    if (!params.pin || !params.amount || !params.serviceType || !params.comment) {
        return res.json(401, {err: 'missing_parameters'});
    }
    sails.log.info('params condition success');
    if (!req.token.phonenumber) {
        sails.log.info('Invallid phone number');
        return res.json(401, {err: 'user_phonenumber_not_valid'});
    }

    async.waterfall([
        // Find Merchant Switch Wallet
        function findZainWallet(callback) {
	sails.log.info("find zain wallet");
          Merchants.findOne({
            id: sails.config.connections.zainSwitchWalletMerchantId,
            deleted: false
          }).exec(function (err, merchant) {
            if (err || !merchant)
              return callback({msg: "merhant_not_found"})

            merchantObj = merchant
            sails.log.info('Merchant Object: ' + JSON.stringify(merchantObj));

            return callback(null);
          })

        },
        function saveNewTransaction(callback) {

            if (parseInt(params.amount) < sails.config.connections.minAmount) {
                return callback({msg: "invalid_transfer_amount"})
            }

            //get authorization from the header
            parts = req.headers.authorization.split(' ')
            token = parts[1]

            // Fill Top Up Transaction Data
            var data = {
                token: token,
                source: "mobile",
                type: "MERCHANT_PAYMENT",
                from: req.token.phonenumber,
                amount: parseInt(params.amount),
                totalFees: parseInt(params.fees),
                to: merchantObj,
                serviceType: params.serviceType,
                comment: params.comment
            }

            sails.log.info('Data to be saved: ' + JSON.stringify(data));

            Transactions.create(data).exec(function createCB(err, obj) {
                if (err) {
                    sails.log.info('Error Details: ' + err.details);
                    return callback({msg: "missing_or_invalid_parameters", details: err.details})
                }

                transaction = obj
                return callback(null);
            })
        },
        function soapInit(callback) {
            soap.createClient(sails.config.connections.sourceoffundUrl, function (err, client) {
              if (err)
                return callback({msg: "soap_connection_error"})

              return callback(null, client)
            })
          },
          function sourceOfFundRequest(client, callback) {
            //populate parameters
            var request = esj.getSourceOfFundRequest(false)
            request.payload.requester.accessValue = req.token.phonenumber
            request.payload.requester.password = params.pin

            //initiate the getMyEligibleSoF API
            client.getMyEligibleSoF(request, function (err, result, body) {
              if (err) {
                esj.parseTncErrors(body, function (error, errorValue) {
                  return callback({msg: error ? err : errorValue})
                })
              }
              else return callback(null, body)
            }, {timeout: esj.requestTimeOut})
          },
          function parseSOFId(body, callback) {
            async.parallel([
                function (callback1) {
                 // get The SOF ID of the User
                  esj.parseSOFId(body, function (error, id) {
                    if (error)
                      return callback1({msg: error})

                    transaction.sofId = id
                    return callback1(null)
                  })
                },
                function (callback2) {
                  // get the SOF Owner ID of the user
                  esj.parseSOFOwnerId(body, function (error, id) {
                    if (error)
                      return callback2({msg: error})

                    transaction.sofOwnerId = id
                    return callback2(null)
                  })
                }],
              function (err, results) {
                if (err)
                  return callback(err)
                return callback(null)
            })
        },
        function updateTransaction(callback) {
            //update transaction
            transaction.status = "pending_confirmation"
            transaction.save(function (err) {
                if (err) {
                    return callback({msg: "transaction_completion_error", details: err});
                }

                return callback(null);

            })
        },
        // Transfer money from user to merchant wallet
        function transfer(callback) {
            transaction.status='confirmed_and_in_process'
            transaction.save(function (err) {
              sails.log.info("confirming transaction");
            })
            soap.createClient(sails.config.connections.merchantPaymentUrl, function (err, client) {
              if (err)
                return callback({msg: "soap_connection_error"});
              sails.log.info('Transaction_to: ' + JSON.stringify(transaction.to));
              //populate parameters
              esj.merchantPaymentRequest.payload.requester.accessValue = req.token.phonenumber;
              esj.merchantPaymentRequest.payload.requester.password = params.pin.toString();
              esj.merchantPaymentRequest.payload.quantity = parseInt(transaction.amount.toString() + '00000');
              esj.merchantPaymentRequest.payload.debitedSofId = transaction.sofId;
              esj.merchantPaymentRequest.payload.beneficiary.identifier = merchantObj.msisdn.toString();
              //esj.merchantPaymentRequest.payload.comment = serial_mint;

              sails.log.info('Merchant Payment object: ' + JSON.stringify(esj.merchantPaymentRequest));

              //initiate the merchantPayment API
              client.merchantPayment(esj.merchantPaymentRequest, function (err, result, body) {
                //esj.merchantPaymentRequest.payload.comment ='bla'
                if (err) {
                  esj.parseTncErrors(body, function (error, errorValue) {
                    return callback({msg: error ? err : errorValue})
                  })
                }
                else {
                  esj.parseMerchantPaymentNewBalance(body, function (error, data) {
                    if (error)
                      return callback(error)

                    return callback(null, data)
                  })
                }
              }, {timeout: esj.requestTimeOut})
            })
        },
        function updateTransaction(data, callback) {
            //update transaction
            transaction.status = "completed";
            transaction.operationId = data.operationId.toString();
            transaction.newBalance = data.newbalance;
            transaction.operationDate = typeof data.operationDate != "undefined" ? new Date(parseInt(data.operationDate)) : new Date();

            try {
              payment.paymentTrigger(transaction);
            } catch (error) {
              sails.log.error("WALLET_CARD_FAILED_TO_CALL_PAYMENT_TRIGGER_API", error);
            }

            transaction.save(function (err) {
              if (err)
                return callback({msg: "transaction_completion_error", details: err})

              return res.json({
                success: 1,
                transaction: transaction,
                merchant: merchantObj
              })
            })
        }],
        function (err, result) {
            sails.log('ESERV ERROR ' + err.msg)
            return res.json({success: 0, err: err.msg});
        }
    )
  },

  /**
   * Perform Reversal
   */
  reverseAmount: function (req, res) {

    var transactionId = req.param('transactionId');
    var merchantPhone = req.param('merchantPhone');
    var merchantId    = req.param('merchantId');
    var pin = sails.config.connections.zainSwitchWalletPin;
    var comment = 'Reversing Switch Top Up Transaction';

    var soapClient, merchant, transaction, newTransaction

    if (!transactionId || !merchantPhone || !merchantId) {
      return res.json(401, {err: 'transactionId, merchantPhone and merchantId are required'});
    }

    async.waterfall([
        function validateMerchant(callback) {
          Merchants.findOne({id: merchantId, deleted: false}, function (err, merch) {
            if (err || !merch)
              return callback({msg: "invalid_phonenumber_or_pin"})

            merchant = merch
            callback(null)
          })
        },
        function validateTransaction(callback) {
          var where = {
            $and: [
              {
                $or: [
                  {
                    to:merchantId
                  },
                  {
                    transfer_to:merchantPhone
                  }
                ]
              },
              {
                id: transactionId,
                status: "completed"
              }
            ],
          };
          Transactions.findOne(where, function (err, trans) {
            if (err || !trans)
              return callback({msg: "invalid_transaction_id"})

            if (!trans.from)
              return callback({msg: "unknown_zain_cash_receiver"})

            if (!trans.amount || trans.amount < sails.config.connections.minAmount)
              return callback({msg: "transaction_amount_cannot_be_refund"})

            if (trans.status !== "completed" || !trans.operationId)
              return callback({msg: "transaction_is_not_completed"})

            transaction = trans
            callback(null)
          })
        },
        function createNewTransaction(callback) {
          if(transaction.operationId){
            comment = comment + transaction.operationId;
          }
          var data = {
            token: "MerchantId=" + merchantId,
            source: "web",
            type: "MERCHANT_PAYMENT_REVERSAL",
            status: "pending_reversal",
            amount: parseInt(transaction.amount),
            credit: true,
            to: merchant,
            from: transaction.from,
            serviceType: "Reversal",
            parent: transaction,
            comment: comment
          }
          Transactions.create(data).exec(function createCB(err, obj) {
            if (err)
              return callback({msg: "missing_or_invalid_parameters", details: err.details})

            //returning the transaction object
            newTransaction = obj
            return callback(null)
          })
        },
        function merchantPaymentReversalRequest(callback) {
          soap.createClient(sails.config.connections.merchantPaymentUrl, function (err, client) {
            if (err)
              return callback({msg: "soap_connection_error"})

            //populate parameters
            esj.merchantPaymentReversalRequest.payload.requester.accessValue = merchant.msisdn
            esj.merchantPaymentReversalRequest.payload.requester.password = pin.toString()
            esj.merchantPaymentReversalRequest.payload.operationId = transaction.operationId
            esj.merchantPaymentReversalRequest.payload.comment = comment

            //initiate the domesticTransfer API
            client.merchantPaymentReversal(esj.merchantPaymentReversalRequest, function (err, result, body) {
              if (err) {
                esj.parseTncErrors(body, function (error, errorValue) {
                  return callback({msg: error ? error : errorValue})
                })
              }
              else {
                esj.parseMerchantPaymentReversal(body, function (error, data) {
                  if (error)
                    return callback(error)

                  return callback(null, data)
                })
              }
            }, {timeout: esj.requestTimeOut})
          })
        },
        function updateTransaction(data, callback) {
          //update new transaction
          newTransaction.status = "completed";
          newTransaction.comment = comment;
          newTransaction.operationId = data.operationId.toString();
          transaction.operationDate = typeof data.operationDate != "undefined" ? new Date(parseInt(data.operationDate)) : new Date();

          try {
            payment.paymentTrigger(transaction);
          } catch (error) {
            sails.log.error("WALLET_CARD_REVERSAL_FAILED_TO_CALL_PAYMENT_TRIGGER_API", error);
          }

          newTransaction.save(function (err) {
            if (err)
              return callback({msg: "transaction_completion_error", details: err})

            transaction.reversed = true;
            transaction.save(function (err) {
              return res.json({
                success: 1,
                newbalance: utils.formatMoney(Number(data.newbalance.slice(0, -5)), 2, '.', ','),
                operationId: newTransaction.operationId
              })
            })
          })
        }
      ],
      function (err, result) {
        return res.json({success: 0, err: err.msg})
      })
  }
  
}