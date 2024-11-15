/**
 * TransactionController
 *
 * @description :: Server-side logic for managing Transaction
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var jwt = require('jsonwebtoken'),
  soap = require('soap'),//Soap Library and XML parser
  requestDiscount=require('request')
module.exports = {

  /**
   * `TransactionController.processing()`
   */
  preview: function (req, res) {

    var params = req.params.all()
    var transaction

    if (!params.id || !params.pin || !req.token.phonenumber){
      return res.json(401, {err: 'missing_parameters'});
    }

    async.waterfall([
        function findTransaction(callback) {
          Transactions.findOne({id: params.id}).populate('to').exec(function (err, trans) {
            if (trans === undefined)
              return callback({msg: "invalid_transaction_id"})

            //set translation variable
            transaction = trans

            //set local
            if (transaction.lang != undefined)
              req.setLocale(transaction.lang)

            if (trans.status != "pending")
              return callback({msg: "transaction_already_submitted"})

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
          request.payload.requester.accessMedium = "WEBMERCHANT"

          //initiate the getMyEligibleSoF API
          client.getMyEligibleSoF(request, function (err, result, body) {
            if (err) {
              esj.parseTncErrors(body, function (error, errorValue) {
                return callback({msg: error ? error : errorValue})
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

          //Travel Discount -- Added By ZainCash team
            requestDiscount({
              'uri': sails.config.connections.travelDiscountUrl,
              'qs': {
                'merchantMsisdn': transaction.to.msisdn.toString(),
                'orderid': transaction.orderId,
                'msisdn': req.token.phonenumber,
                'amount': transaction.amount.toString()
              }
            },function (error, response, body) {
              var newAmount=parseInt(body);
              if (parseInt(transaction.amount)!=newAmount)
              {
                transaction.traveldiscount=transaction.amount
              }
              transaction.amount=newAmount;
              transaction.save();










            //populate parameters
            esj.merchantPaymentComputeServiceChargeRequest.payload.requester.accessMedium = "WEBMERCHANT"
            esj.merchantPaymentComputeServiceChargeRequest.payload.requester.accessValue = req.token.phonenumber
            esj.merchantPaymentComputeServiceChargeRequest.payload.requester.password = params.pin
            esj.merchantPaymentComputeServiceChargeRequest.payload.amount = parseInt(transaction.amount + '00000')
            esj.merchantPaymentComputeServiceChargeRequest.payload.targetOperationType = "MERCHANT_PAYMENT"
            esj.merchantPaymentComputeServiceChargeRequest.payload.debitedActor.identifier = transaction.sofOwnerId
            esj.merchantPaymentComputeServiceChargeRequest.payload.debitedSofId = transaction.sofId
            esj.merchantPaymentComputeServiceChargeRequest.payload.creditedActor.identifier = transaction.to.msisdn.toString()

            //initiate the computeServiceCharge API
            client.computeServiceCharge(esj.merchantPaymentComputeServiceChargeRequest, function (err, result, body) {
              if (err)
                esj.parseTncErrors(body, function (error, errorValue) {
                  return callback({msg: error ? error : errorValue})
                })
              else
                esj.parseFeeValue(body, function (error, fee) {
                  if (error)
                    return callback({msg: error})
                  transaction.totalFees = parseInt(parseInt(fee) / 100000)
                  return callback(null)
                })
            }, {timeout: esj.requestTimeOut})
        });
      },
        function updateTransaction(callback) {
          //update transaction
          transaction.status = "pending_confirmation"
	if (typeof transaction.serviceType=="undefined"){
         transaction.serviceType = "SERVICE PROVIDER";  
       }
	transaction.from = req.token.phonenumber.toString()

          transaction.save(function (err) {
            if (err)
              return callback({msg: "transaction_completion_error", details: err})
            else
              if (transaction.hasOwnProperty('traveldiscount'))
              {
              return res.json({
                success: 1,
                transactionId: params.id,
                name : transaction.to.name,
                discount : parseInt(transaction.totalFees) + parseInt(transaction.amount) - parseInt(transaction.traveldiscount),
                totalFees: parseInt(transaction.totalFees),
                total: parseInt(transaction.totalFees) + parseInt(transaction.amount)
              })              }
              return res.json({
                success: 1,
                transactionId: params.id,
                name : transaction.to.name,
                totalFees: parseInt(transaction.totalFees),
                total: parseInt(transaction.totalFees) + parseInt(transaction.amount)
              })
          })
        }],

      function (err, result) {

        msgToReturn = err.msg != undefined ? err.msg : err

        //update transaction
        if (transaction != undefined) {
          transaction.status = "failed"
          transaction.due = msgToReturn
          transaction.from = params.phonenumber
          transaction.save(function (err, trans) {
            //return error
            if (transaction.redirectUrl != undefined && transaction.redirectUrl != "") {
              jwt.sign({
                status: "failed", msg: msgToReturn,
                orderid: transaction.orderId ? transaction.orderId : "", id: params.id
              }, transaction.to.secret, {expiresIn: '1h'}, function (err, token) {
                return res.json({success: 0, err:{error:msgToReturn,url: utils.buildRedirectUrl(transaction.redirectUrl,token)}})
              })
            }
            else
              return res.json({success: 0, err: {error:msgToReturn}})
          })
        }
        else
          return res.json({success: 0, err: {error:msgToReturn}})
      })
  },
  /**
   * `TransactionController.processingOTP()`
   */
  confirm: function (req, res) {

    var params = req.params.all()
    var transaction
    var secret

    if (!params.id || !params.pin){
      return res.json(401, {err: 'missing_parameters'});
    }

    async.waterfall([
        function findTransaction(callback) {
          Transactions.findOne({id: params.id}).populate('to').exec(function (err, trans) {
            if (trans === undefined)
              return callback({msg: "invalid_transaction_id"})

            //set translation variable
            transaction = trans
            secret = transaction.to.secret
            //set local
            if (transaction.lang != undefined)
              req.setLocale(transaction.lang)

            if (trans.status != "pending_confirmation")
              return callback({msg: "transaction_already_submitted"})

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
        function merchantPaymentRequest(client, callback) {
          //populate parameters

          console.log("to numnber"  + transaction.to.msisdn.toString())
          esj.merchantPaymentRequest.payload.debitedSofId = transaction.sofId
          esj.merchantPaymentRequest.payload.requester.accessValue = transaction.from
          esj.merchantPaymentRequest.payload.requester.password = params.pin.toString()
          esj.merchantPaymentRequest.payload.requester.accessMedium = "WEBMERCHANT"
          esj.merchantPaymentRequest.payload.quantity = parseInt(transaction.amount + '00000')
          esj.merchantPaymentRequest.payload.beneficiary.identifier = transaction.to.msisdn.toString()
          esj.merchantPaymentRequest.payload.comment = 'MobileAppServiceProvider'

          client.merchantPayment(esj.merchantPaymentRequest, function (err, result, body) {
            if (err) {
              esj.parseTncErrors(body, function (error, errorValue) {
                console.log("error in  merchant payment " + error)
                console.log("error in  merchant payment " + errorValue)
                return callback({msg: error ? error : errorValue})
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
        },
        function updateTransaction(data, callback) {
          console.log("After payment --  Data " + data)
          //update transaction
          transaction.status = "completed";
          transaction.operationId = data.operationId.toString();
          transaction.newBalance = data.newbalance;
          transaction.operationDate = typeof data.operationDate != "undefined" ? new Date(parseInt(data.operationDate)) : new Date();
          
          try {
            payment.paymentTrigger(transaction);
          } catch (error) {
            sails.log.error("SERVICE_PROVIDER_PAYMENT_FAILED_TO_CALL_PAYMENT_TRIGGER_API", error);
          }

          transaction.save(function (err) {
            if (err){
              console.log("error in update transaction " + err)
              return callback({msg: "transaction_completion_error", details: err})
            }

            var redirectUrl = "";
            if (transaction.redirectUrl){
              redirectUrl = transaction.redirectUrl;
              jwt.sign({
                status: "success",
                orderid: transaction.orderId ? transaction.orderId : "",
                id: params.id,
                operationid:transaction.operationId,
                msisdn:transaction.from
              }, secret, {
                expiresIn: '4h'
              }, function (err, token) {
                var redirectionURL='';
                if (transaction.to.id==sails.config.bookingAdvisorId)
                {
                  redirectionURL=transaction.redirectUrl + '&token=' + token
                } else {
                  redirectionURL=utils.buildRedirectUrl(transaction.redirectUrl,token)
                }
                return res.json({

                  redirectUrl :redirectionURL,
                  newBalance: utils.formatMoney(Number(data.newbalance.slice(0, -5)), 2, '.', ','),
                  total: parseInt(transaction.totalFees) + parseInt(transaction.amount),
                  transactionId: params.id,
                  success:1
                });
              })
            }else{
              return res.json({
                newBalance: utils.formatMoney(Number(data.newbalance.slice(0, -5)), 2, '.', ','),
                total: parseInt(transaction.totalFees) + parseInt(transaction.amount),
                transactionId: params.id,
                redirectUrl:redirectUrl,
                success:1
              });
            }
          })
        },
      ],
      function (err, result) {
        console.log("in error function error " + err)
        console.log("in error function result " + result)
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
                toReturn.url = utils.buildRedirectUrl(transaction.redirectUrl,token)
                if (transaction.to.id==sails.config.bookingAdvisorId)
                {
                  toReturn.url = transaction.redirectUrl + '&token=' + token
                }
                return res.json({success: 0, err: toReturn});
              })
            }
            else
              return res.json({success: 0, err: toReturn});
          })
        }
        else
          return res.json({success: 0, err: toReturn});
      })
  },

}

