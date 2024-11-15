/**
 * Switch Controller
 *
 * @description :: Server-side logic for managing Transaction
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var soap = require('soap');

module.exports = {

  /**
   * `ProductController.preview()`
   *
   */
  preview: function (req, res) {
    var params = req.params.all()
    var transaction, merchantObj
    var currencyConversion = {}
    var requestParams = {}
    if (!params.pin || !params.first_name || !params.middle_name || !params.last_name
      || !params.mobile || !params.denomination_value || !params.merchantId) {
      sails.log.info('params ' + params.toString());
      return res.json(401, {err: 'missing_parameters'});
    }


    if (!req.token.phonenumber)
      return res.json(401, {err: 'user_phonenumber_not_valid'});

    // if (params.request)
    //   requestParams = params.request

    async.waterfall([
        function findMerchantWallet(callback) {
          Merchants.findOne({id: params.merchantId, deleted: false}).exec(function (err, merchant) {
            if (err || !merchant)
              return callback({msg: "merchant_not_found"}) // merhcant id should be the same !! hard coded

            merchantObj = merchant
            callback(null)
          })
        },
        function checkCurrency(callback) {
          if (merchantObj.currency != "IQD" && merchantObj.currency != "") {
            CurrenciesConversion.findOne({from: merchantObj.currency}).exec(function (err, cur) {
              if (err || !cur)
                return callback({msg: "currency_not_supported"})

              currencyConversion = {
                mainAmount: params.amount,
                cur: cur.from,
                rate: cur.rate,
                date: cur.updatedAt
              }
              return callback(null, utils.convertUSDAmount(params.amount, cur))
            })
          }
          else return callback(null, params.amount)
        },
        function saveNewTransaction(amount, callback) {

          //get authorization from the header
          parts = req.headers.authorization.split(' ')
          token = parts[1]

          var data = {
            token: token,
            source: "mobile",
            type: "MERCHANT_PAYMENT",
            from: req.token.phonenumber,
            amount: params.amount.toString(),
            to: merchantObj,
            serviceType: "switch",
            currencyConversion: currencyConversion,
            switch_info: {
              first_name: params.first_name,
              middle_name: params.middle_name,
              last_name: params.last_name,
              mobile: params.mobile,
              // address: params.address,
              // birthday: params.birthday,
              // document_type: params.document_type,
              // document_number: params.document_id,
              // email: params.email,
              denomination: params.denomination_value
            }
          }

          Transactions.create(data).exec(function createCB(err, obj) {
            if (err)
              return callback({msg: "missing_or_invalid_parameters", details: err.details})

            transaction = obj
            return callback(null)
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
                esj.parseSOFId(body, function (error, id) {
                  if (error)
                    return callback1({msg: error})

                  transaction.sofId = id
                  return callback1(null)
                })
              },
              function (callback2) {
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
        function soapMerchantInit(callback) {
          soap.createClient(sails.config.connections.merchantPaymentUrl, function (err, client) {
            if (err)
              return callback({msg: "soap_connection_error"})

            return callback(null, client)
          })
        },
        function getFees(client, callback) {
          //populate parameters
          esj.computeServiceChargeRequest.payload.requester.accessValue = req.token.phonenumber
          esj.computeServiceChargeRequest.payload.requester.password = params.pin
          esj.computeServiceChargeRequest.payload.amount = parseInt(transaction.amount + '00000')
          esj.computeServiceChargeRequest.payload.targetOperationType = "MERCHANT_PAYMENT"
          esj.computeServiceChargeRequest.payload.debitedActor.identifier = transaction.sofOwnerId
          esj.computeServiceChargeRequest.payload.debitedSofId = transaction.sofId

          //initiate the computeServiceCharge API
          client.computeServiceCharge(esj.computeServiceChargeRequest, function (err, result, body) {
            if (err)
              esj.parseTncErrors(body, function (error, errorValue) {
                return callback({msg: error ? err : errorValue})
              })
            else
              esj.parseFeeValue(body, function (error, fee) {
                if (error)
                  return callback({msg: error})
                transaction.totalFees = parseInt(parseInt(fee) / 100000)
                return callback(null)
              })
          }, {timeout: esj.requestTimeOut})
        },
        function updateTransaction(callback) {
          //update transaction
          transaction.status = "pending_confirmation"
          transaction.save(function (err) {
            if (err)
              return callback({msg: "transaction_completion_error", details: err})
            else {
              sails.log.info('transaction  ' + transaction.toString());
              return res.json({
                success: 1,
                transactionId: transaction.id,
                first_name: transaction.switch_info.first_name,
                middle_name: transaction.switch_info.middle_name,
                last_name: transaction.switch_info.last_name,
                mobile: transaction.switch_info.mobile,
                // address: transaction.switch_info.address,
                // birthday: transaction.switch_info.birthday,
                // document_type: transaction.switch_info.document_type,
                // document_id: transaction.switch_info.document_number,
                // email: transaction.switch_info.email,
                denomination: transaction.switch_info.denomination,
                totalFees: parseInt(transaction.totalFees),
                amount: parseInt(transaction.amount),
                total: parseInt(transaction.totalFees) + parseInt(transaction.amount),
              })
            }
          })
        }],
      function (err, result) {
        sails.log.info('ESERV ERROR ' + err.msg)
        return res.json({success: 0, err: err.msg});
      })
  },

  /**
   * `TransferController.confirm()`
   *
   */
  confirm: function (req, res) {
    var params = req.params.all()
    var transactionId = params.transactionId;
    var pin = params.pin;
    var cardNumber = params.card_number;
    var customerMobile = params.customerMobile;
    var transaction

    if (!req.token.phonenumber)
      return res.json(401, {err: 'user_phonenumber_not_valid'});

    if (!transactionId || !pin)
      return res.json(401, {err: 'missing_parameters'});

    async.waterfall([
        function validateTransaction(callback) {
          Transactions.findOne({id: transactionId}).populate("to").exec(function (err, trans) {
            if (err || !trans)
              return callback({msg: "invalid_transaction_id"})

            if (!trans.to.msisdn)
              return callback({msg: "unknown_zain_cash_receiver"})

            if (!trans.amount || parseInt(trans.amount) < sails.config.connections.minAmount)
              return callback({msg: "invalid_transfer_amount"})

            if (trans.status !== "pending_confirmation")
              return callback({msg: "transaction_is_already_completed"})

            transaction = trans
            callback(null)
          })
        },
        function transfer(callback) {
          soap.createClient(sails.config.connections.merchantPaymentUrl, function (err, client) {
            if (err)
              return callback({msg: "soap_connection_error"})

            //populate parameters
            esj.merchantPaymentRequest.payload.requester.accessValue = req.token.phonenumber
            esj.merchantPaymentRequest.payload.requester.password = pin.toString()
            sails.log.info("amount " + parseInt(transaction.amount.toString() + '00000'))
            esj.merchantPaymentRequest.payload.quantity = parseInt(transaction.amount.toString() + '00000')
            esj.merchantPaymentRequest.payload.debitedSofId = transaction.sofId
            esj.merchantPaymentRequest.payload.beneficiary.identifier = transaction.to.msisdn.toString()
            esj.merchantPaymentRequest.payload.comment = 'CustomerMobile ' + customerMobile + ' CardNumber ' + cardNumber

            //initiate the merchantPayment API
            client.merchantPayment(esj.merchantPaymentRequest, function (err, result, body) {
              esj.merchantPaymentRequest.payload.comment='bla'
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
          transaction.status = "completed"
          transaction.operationId = data.operationId.toString()
          transaction.newBalance = data.newbalance;
          transaction.cardNumber = cardNumber;
          transaction.operationDate = typeof data.operationDate != "undefined" ? new Date(parseInt(data.operationDate)) : new Date();
          
          try {
            payment.paymentTrigger(transaction);
          } catch (error) {
            sails.log.error("SWITCH_EGATE_FAILED_TO_CALL_PAYMENT_TRIGGER_API", error);
          }

          transaction.save(function (err) {
            if (err)
              return callback({msg: "transaction_completion_error", details: err})

            return res.json({
              success: 1,
              transaction: transaction
            })
          })
        },
      ],
      function (err, result) {
        sails.log('ESERV ERROR ' + err.msg)
        return res.json({success: 0, err: err.msg})
      })
  },

  /**
   * update transaction if soap call failed
   */
  update: function (req, res) {
    var params = req.params.all()
    var transactionId = params.transactionId;
    var success = params.success;
    var cardNumber = params.card_number;
    var transaction

    if (!transactionId)
      return res.json(401, {err: 'missing_parameters'});

    async.waterfall([
        function validateTransaction(callback) {
          Transactions.findOne({id: transactionId}).populate("to").exec(function (err, trans) {
            if (err || !trans)
              return callback({msg: "invalid_transaction_id"})

            if (!trans.to.msisdn)
              return callback({msg: "unknown_zain_cash_receiver"})

            if (!trans.amount || parseInt(trans.amount) < sails.config.connections.minAmount)
              return callback({msg: "invalid_transfer_amount"})

            if (trans.status !== "pending_confirmation")
              return callback({msg: "transaction_is_already_completed"})

            transaction = trans
            callback(null)
          })
        },
        function updateTransaction(data, callback) {
          //update transaction
          if (success) {
            transaction.status = "completed";
            transaction.cardNumber = cardNumber;
          } else {
            transaction.status = 'failed';
            transaction.cardNumber = cardNumber;
          }
          transaction.save(function (err) {
            if (err)
              return callback({msg: "transaction_completion_error", details: err})

            return res.json({
              success: 1,
              transaction: transaction
            })
          })
        },
      ],
      function (err, result) {
        sails.log('ESERV ERROR ' + err.msg)
        return res.json({success: 0, err: err.msg})
      })
  },


  /**
   * `OneCardController.transaction()`
   *
   */
  data: function (req, res) {
    var params = req.params.all()
    var transactionId = params.transactionId;
    var transaction
    var sofId, sofOwnerId
    console.log("params" + params);

    if (!params.pin) {
      return res.json(401, {err: 'missing_parameters'});
    }

    if (!transactionId)
      return res.json(401, {err: 'missing_parameters'});

    async.waterfall([
        function getTransaction(callback) {
          Transactions.findOne({id: transactionId}).populate("to").exec(function (err, trans) {
            if (err || !trans)
              return callback({msg: "invalid_transaction_id"})

            if (!trans.to.msisdn)
              return callback({msg: "unknown_zain_cash_receiver"})

            if (!trans.amount || parseInt(trans.amount) < sails.config.connections.minAmount)
              return callback({msg: "invalid_transfer_amount"})

            if (trans.status !== "pending_confirmation")
              return callback({msg: "transaction_is_already_completed"})

            transaction = trans
            callback(null)
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
                esj.parseSOFId(body, function (error, id) {
                  if (error)
                    return callback1({msg: error})

                  sofId = id
                  return callback1(null)
                })
              },
              function (callback2) {
                esj.parseSOFOwnerId(body, function (error, id) {
                  if (error)
                    return callback2({msg: error})

                  sofOwnerId = id
                  return callback2(null)
                })
              }],
            function (err, results) {
              if (err)
                return callback(err)
              return callback(null)
            })
        },
        function soapInitBalance(callback) {
          soap.createClient(sails.config.connections.sourceoffundUrl, function (err, client) {
            if (err)
              return callback({msg: "soap_connection_error"})

            soapClient = client
            callback(null)
          })
        },
        function getMySoFBalanceRequest(callback) {
          //populate parameters
          var request = esj.getMySoFBalanceRequest(false)
          request.payload.requester.accessValue = req.token.phonenumber
          request.payload.requester.password = params.pin
          request.payload.sofId = sofId

          //initiate the getMySoFBalance API
          soapClient.getMySoFBalance(request, function (err, result, body) {
            if (err)
              esj.parseTncErrors(body, function (error, errorValue) {
                return callback({msg: error ? error : errorValue})
              })
            else
              callback(null, body)
          }, {timeout: esj.requestTimeOut})
        },
        function parseBalanceValue(body, callback) {
          esj.parseBalanceValue(body, function (error, balance) {
            if (error)
              return callback({msg: error})
            return res.json({success: 1, balance: balance.slice(0, -5), transaction: transaction, sofId: sofId})
          })
        }],
      function (err, result) {
        sails.log('ESERV ERROR ' + err.msg)
        return res.json({success: 0, err: err.msg});
      })
  },

  /**
   * validate pin
   *
   */
  validateUser : function (req, res) {
    var phonenumber = req.param('phone')
    var pin = req.param('pin')
    var sofId

    if (!phonenumber || !pin) {
      return res.json(401, {err: 'Phone and Pin are required'});
    }
    async.waterfall([
        function ValideEserv(callback) {
          soap.createClient(sails.config.connections.sourceoffundUrl, function (err, client) {
            if (err)
              return callback({msg: "soap_connection_error"})

            var request = esj.getSourceOfFundRequest(false)
            request.payload.requester.accessValue = phonenumber.toString();
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
  }

}

