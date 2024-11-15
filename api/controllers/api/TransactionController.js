/**
 * TransactionController
 *
 * @description :: Server-side logic for managing Transaction
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var soap = require('soap'),
  jwt = require('jsonwebtoken');

module.exports = {

  /**
   * `TransactionController.getLatest()`
   *
   */
  getLatest: function (req, res) {

    var params = req.params.all()
    var pin = params.pin
    var sofId = params.sof_id
    var transactions = []
    var balance = 0

    if (!pin || !sofId) {
      return res.json(401, {err: 'phone_and_pin_are_required'});
    }
    if (!req.token.phonenumber)
      return res.json(401, {err: 'user_phonenumber_not_valid'});

    async.parallel([
        function getTransactionsFromEserv(callback) {
          soap.createClient(sails.config.connections.historyPaymentUrl, function (err, client) {
            if (err)
              return callback({msg: "soap_connection_error"})

            esj.getMyLastFinancialTransactionsRequest.payload.requester.accessValue = req.token.phonenumber
            esj.getMyLastFinancialTransactionsRequest.payload.requester.password = pin
            esj.getMyLastFinancialTransactionsRequest.payload.maxReturnResults = 20
            esj.getMyLastFinancialTransactionsRequest.payload.sourceOfFundsId = sofId
            //initiate the getMyLastFinancialTransactions API
            client.getMyLastFinancialTransactions(esj.getMyLastFinancialTransactionsRequest, function (err, result, body) {
              if (err)
                esj.parseClientErrors(body, function (error, errorValue) {
                  return callback({msg: error ? error : errorValue})
                })
              else
                esj.parseTransactions(body, function (error, trans) {
                  if (error)
                    return callback({msg: error})
                  transactions = trans
                  return callback(null)
                })
            }, {timeout: esj.requestTimeOut})
          })
        },
        function getBalanceFromEserv(callback) {
          soap.createClient(sails.config.connections.sourceoffundUrl, function (err, client) {
            if (err)
              return callback({msg: "soap_connection_error"})

            //populate parameters
            var request = esj.getMySoFBalanceRequest(false)
            request.payload.requester.accessValue = req.token.phonenumber
            request.payload.requester.password = pin
            request.payload.sofId = sofId
            client.getMySoFBalance(request, function (err, result, body) {
              if (err) {
                esj.parseTncErrors(body, function (error, errorValue) {
                  return callback({msg: error ? error : errorValue})
                })
              }
              else {
                esj.parseBalanceValue(body, function (error, bal) {
                  if (error)
                    return callback({msg: error})

                  balance = bal.slice(0, -5)
                  return callback(null)
                })
              }
            }, {timeout: esj.requestTimeOut})
          })
        }
      ],
      function (err, results) {
        if (err) {
          err.msg = err.msg != undefined ? err.msg : "unknown_error"
          sails.log('ESERV ERROR ' + err.msg)
          return res.json(401, {err: err.msg});
        }
        return res.json({transactions: transactions, balance: balance})
      }
    )
  },

  getOne: function (req, res) {
    var params = req.params.all()
    var operationId = params.operationId
    var phone = req.token.phonenumber

    if (!operationId) {
      return res.json(401, {err: 'operationId_is_required'});
    }
    if (!phone)
      return res.json(401, {err: 'user_phonenumber_not_valid'});

    Transactions.findOne({operationId: operationId}).populate('to').exec(function (err, trans) {
      if (err || trans === undefined)
        return res.json({})

      //set translation variable
      if (
        (trans.to && trans.to.msisdn == phone)
        || trans.transfer_to == phone
        || trans.from == phone
        || (trans.topup && trans.topup.number == phone)
      ) {
        return res.json({transaction: trans})
      }

      return res.json(401, {err: "access_denied"});

    })
  },

  getPayByReferenceTransaction:function(req,res){
    var params = req.params.all()
    var referenceNumber = params.referenceNumber
    var transaction
    var phone = req.token.phonenumber
    
    if (!params.referenceNumber)
      return res.json(401, {err: 'missing_parameters'});

    if (!req.token.phonenumber)
      return res.json(401, {err: 'user_phonenumber_not_valid'});

    async.waterfall([
        function findTransaction(callback){
          Transactions.findOne({referenceNumber: referenceNumber}).populate('to').exec(function (err, trans) {
            if (err || trans === undefined)
              return callback({msg: "invalid_reference_number"})

              return res.json({
                success: 1,
                transaction: trans
              })

          })
        }],
      function (err, result) {
        sails.log('ESERV ERROR ' + err.msg)
        return res.json({success: 0, err: err.msg});
      })
  },

  payByReferencePreview:function(req,res){
    var params = req.params.all()
    var transactionId = params.transactionId;
    var transaction, merchantObj
    var currencyConversion = {}
    var phone = req.token.phonenumber

    if (!params.pin || !params.transactionId)
      return res.json(401, {err: 'missing_parameters'});

    if (!req.token.phonenumber)
      return res.json(401, {err: 'user_phonenumber_not_valid'});

    async.waterfall([
        function findTransaction(callback){
          Transactions.findOne({id: transactionId}).populate('to').exec(function (err, trans) {
            if (err || trans === undefined)
              return res.json({})

            transaction = trans;

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
          transaction.from = req.token.phonenumber;
          transaction.save(function (err) {
            if (err)
              return callback({msg: "transaction_completion_error", details: err})
            else
              return res.json({
                success: 1,
                transaction: transaction
              })
          })
        }],
      function (err, result) {
        sails.log('ESERV ERROR ' + err.msg)
        return res.json({success: 0, err: err.msg});
      })
  },

  payByReferenceConfirm:function(req,res){
    var params = req.params.all()
    var transactionId = params.transactionId;
    var pin = params.pin;
    var transaction;
    var secret;

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
            secret = transaction.to.secret
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
            esj.merchantPaymentRequest.payload.quantity = parseInt(transaction.amount.toString() + '00000')
            esj.merchantPaymentRequest.payload.debitedSofId = transaction.sofId
            esj.merchantPaymentRequest.payload.beneficiary.identifier = transaction.to.msisdn.toString()

            //initiate the merchantPayment API
            client.merchantPayment(esj.merchantPaymentRequest, function (err, result, body) {
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
          transaction.comment = "Pay by Reference";
          transaction.operationId = data.operationId.toString();
          transaction.newBalance = data.newbalance;
          transaction.operationDate = typeof data.operationDate != "undefined" ? new Date(parseInt(data.operationDate)) : new Date();
          
          try {
            payment.paymentTrigger(transaction);
          } catch (error) {
            sails.log.error("API_TRANSACTION_FAILED_TO_CALL_PAYMENT_TRIGGER_API", error);
          }
          
          transaction.save(function (err) {
            if (err)
              return callback({msg: "transaction_completion_error", details: err})
            jwt.sign({
              status: "success",
              orderid: transaction.orderId ? transaction.orderId : "",
              id: transactionId,
              operationid:transaction.operationId,
              msisdn:transaction.from
            }, secret, {
              expiresIn: '4h'
            }, function (err, token) {
              transaction.redirectUrl = transaction.redirectUrl + '?token=' + token;

              return res.json({
                success: 1,
                transaction: transaction
              })
            })
            
          })
        },
      ],
      function (err, result) {
        sails.log('ESERV ERROR ' + err.msg)
        var msgToReturn = err.msg != undefined ? err.msg : err
        var toReturn = {
          error: msgToReturn,
          details: err.details != undefined ? err.details : "",
          transaction: transaction != undefined ? transaction : ""
        }
        //update transaction
        if (transaction != undefined) {
          transaction.status = "failed"
          transaction.due = msgToReturn
          transaction.save(function (err, trans) {
            //return error
            if (secret && transaction.redirectUrl != undefined && transaction.redirectUrl != "") {
              jwt.sign({
                status: "failed", msg: msgToReturn,
                orderid: transaction.orderId ? transaction.orderId : "", id: params.id
              }, secret, {expiresIn: '1h'}, function (err, token) {
                transaction.redirectUrl = transaction.redirectUrl + '?token=' + token;
                return res.json({success: 0, err: err.msg, transaction: transaction});
              })
            }
            else
              return res.json({success: 0, err: err.msg})
          })
        }

        return res.json({success: 0, err: err.msg})
        
      })
  }
}

