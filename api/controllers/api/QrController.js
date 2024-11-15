/**
 * QrController
 *
 * @description :: Server-side logic for managing QR Payment
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var soap = require('soap');
var httpcashierSMS = require('http');

module.exports = {

  /**
   * `QrController.preview()`
   *
   */
  preview: function (req, res) {
    var params = req.params.all()
    var transaction, merchantObj
    var currencyConversion = {}
    var requestParams = {}
    if (!params.pin || !params.amount || !params.merchantId) {
      return res.json(401, {err: 'missing_parameters'});
    }
    if (parseInt(params.amount) < sails.config.connections.minAmount) {
      return res.json(401, {err: 'invalid_transfer_amount'})
    }
    
    if (!req.token.phonenumber) {
      return res.json(401, {err: 'user_phonenumber_not_valid'});
    }

    if (params.request)
      requestParams = params.request

    async.waterfall([
        function findMerchantWallet(callback) {
          Merchants.findOne({id: params.merchantId,deleted:false}).exec(function (err, merchant) {
            if (err || !merchant)
              return callback({msg: "merhant_not_found"})

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
            amount: amount,
            to: merchantObj,
            serviceType: "PRODUCTS",
            currencyConversion: currencyConversion
          }

          if (params.bill_id) 
            data.bill_id = params.bill_id;

          if (params.comment)
            data.comment = params.comment;

          if (params.cashier)
            data.cashier = params.cashier;

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
            else
              return res.json({
                success: 1,
                merchantName:merchantObj.name,
                transactionId:transaction.id,
                totalFees: parseInt(transaction.totalFees),
                amount: parseInt(transaction.amount),
                total: parseInt(transaction.totalFees) + parseInt(transaction.amount),
                comment:transaction.comment,
                bill_id:transaction.bill_id
              })
          })
        }],
      function (err, result) {
        sails.log('ESERV ERROR ' + err.msg)
        return res.json({success: 0, err: err.msg});
      })
  },

  /**
   * `QrController.confirm()`
   *
   */
  confirm: function (req, res) {
    var params = req.params.all()
    var transactionId = params.transactionId;
    var pin = params.pin;
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
            esj.merchantPaymentRequest.payload.quantity = parseInt(transaction.amount.toString() + '00000')
            esj.merchantPaymentRequest.payload.debitedSofId = transaction.sofId
            esj.merchantPaymentRequest.payload.beneficiary.identifier = transaction.to.msisdn.toString()
            esj.merchantPaymentRequest.payload.comment = 'QR_PAYMENT'

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
          transaction.operationId = data.operationId.toString();
          transaction.newBalance = data.newbalance;
          transaction.operationDate = typeof data.operationDate != "undefined" ? new Date(parseInt(data.operationDate)) : new Date();
          
          try {
            payment.paymentTrigger(transaction);
          } catch (error) {
            sails.log.error("QR_FAILED_TO_CALL_PAYMENT_TRIGGER_API", error);
          }

          transaction.save(function (err) {
            if (err)
              return callback({msg: "transaction_completion_error", details: err})
            //ZainCash TEAM
            if (transaction.cashier)
            {
              var buff = new Buffer(JSON.stringify(transaction)).toString("base64");
              $url='http://10.50.25.231/qrcashier/api.php?token='+encodeURIComponent(buff);
              httpcashierSMS.get($url,function (resp){
                //nothing
              }).on("error", (err) => {
                    console.log("Error: " + err.message);
              });
            }
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
}

