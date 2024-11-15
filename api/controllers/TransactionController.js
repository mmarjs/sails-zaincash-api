/**
 * TransactionController
 *
 * @description :: Server-side logic for managing Transaction
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var jwt = require('jsonwebtoken'),
  soap = require('soap'),//Soap Library and XML parser
  math = require('mathjs'),//Soap Library and XML parser
  smpp = require('smpp'),
  requestDiscount=require('request');

const NodeCache = require( "node-cache" );
const myCache = new NodeCache( { stdTTL: 82400} );

module.exports = {

  /**
   * `TransactionController.init()`
   *
   * The first step is to issue a transactin id that you’ll be using in future steps.
   * Based on the privatekey that we sent to the merchant, he will generate a token with a
   * payload of amount to be transfered and msisdn that represent the merchant phonenumber
   * and serviceType that represent the type of the service like 'AAA books website'
   */
  init: function (req, res) {

    var params = req.params.all();
    var merchantObj;
    var currencyConversion = {};
    var referenceNumber=false;
    sails.log.info('init');
    sails.log.info('Request Params' + JSON.stringify(params));
    async.waterfall([
        function findMerchant(callback) {
          //set local
          if (params.lang != undefined)
            req.setLocale(params.lang)

          //validate merchant id
          if (!customValidation.isValideId(params.merchantId))
            return callback({msg: "invalid_merchant_id"})

          Merchants.findOne({id: params.merchantId, deleted: false}).exec(function (err, merchant) {
            if (err || !merchant)
              return callback({msg: "merchant_not_found"})

            merchantObj = merchant;
            sails.log.info('merchant object: ' + JSON.stringify(merchantObj));
            callback(null)
          })
        },
        function verifyToken(callback) {
          jwt.verify(params.token, merchantObj.secret, function (err, decoded) {
            if (err)
              return callback({msg: "token_not_valid_expired"})

            if (decoded.amount === undefined || !customValidation.isNumeric(decoded.amount) || parseInt(decoded.amount) < 250)
              return callback({msg: "invalid_amount"})

            if (decoded.msisdn === undefined || decoded.msisdn != merchantObj.msisdn)
              return callback({msg: "invalid_merchant_id"})

            callback(null, decoded)
          })
        },
        function checkCurrency(decoded, callback) {
          if (merchantObj.currency != "IQD" && merchantObj.currency != "") {
            CurrenciesConversion.findOne({from: merchantObj.currency}).exec(function (err, cur) {
              if (err || !cur)
                return callback({msg: "currency_not_supported"})

              currencyConversion = {
                mainAmount: decoded.amount,
                cur: cur.from,
                rate: cur.rate,
                date: cur.updatedAt
              }
              callback(null, decoded, utils.convertUSDAmount(decoded.amount, cur))
            })
          }
          else callback(null, decoded, decoded.amount,callback)
        },
        function payByReference(decoded, amount,currentCallback, callback) {
          if (typeof merchantObj.pay_by_reference!="undefined"){
            if (merchantObj.pay_by_reference){
              referenceNumber = utils.randomString(6);
              Transactions.findOne({referenceNumber: referenceNumber}).exec(function (err, transaction) {
                if (err || !transaction)
                  return callback(null,decoded,amount);
                currentCallback(null,decoded,amount,currentCallback);
              })
            }else{
              callback(null,decoded,amount);
            }
          }else{
            callback(null,decoded,amount);
          }
        },
        function saveNewTransaction(decoded, amount, callback) {
          var data = {
            token: params.token,
            source: "web",
            type: "MERCHANT_PAYMENT",
            amount: amount,
            to: merchantObj,
            serviceType: decoded.serviceType,
            lang: params.lang ? params.lang : "ar",
            orderId: decoded.orderId != undefined ? decoded.orderId : "",
            currencyConversion: currencyConversion
          }

          if (referenceNumber){
            data.referenceNumber = referenceNumber;
          }


          if (decoded.redirectUrl) {
            var safeUrl = decodeURI(decoded.redirectUrl.toString())
              .toLowerCase()
              .replace("javascript", "bad")
              .replace("cookie", "changeyourscriptname")
              .replace("base64", "changeyourscriptname")
              .replace("data:text", "changeyourscriptname")
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')  // it's not neccessary to escape >
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;')
              .replace(/;/g, "")
              .replace(/\+/g, "");

            var url = require("url");
            var result = url.parse(decoded.redirectUrl);
            if (result.hostname) {
              if (safeUrl.indexOf("http://") != 0 && safeUrl.indexOf("https://") != 0) {
                // do something here
                safeUrl = "http://" + safeUrl;
              }
              data.redirectUrl = encodeURI(safeUrl)
            }
          }
          sails.log.info("transaction: " + JSON.stringify(data));
          Transactions.create(data).exec(function createCB(err, obj) {
            if (err)
              return callback({msg: "missing_or_invalid_parameters", details: err.details})

            //returning the transaction object
            return res.json(obj)
          })
        }
      ],
      function (err) {
      sails.log.info('init error: ' + JSON.stringify(err));
        if (err) {
          err.msg = err.msg != undefined ? req.__(err.msg) : req.__("unknown_error")
          return res.json({err: err})
        }
        return res.serverError()
      })
  },

  /**
   * `TransactionController.get()`
   *
   * This step is crucial to you to make sure that the transaction associated with the provided id is issued successfully.
   * the request should contain the transacting id, if the transaction id is created longer than 1 hour
   * you’ll not be able to check the status of it
   */
  get: function (req, res) {
    sails.log.info('get function');
    var params = req.params.all();
    sails.log.info('Request Params: ' + JSON.stringify(params));
    var merchantObj;
    async.waterfall([
        function findMerchant(callback) {
          if (!customValidation.isValideId(params.merchantId))
            return callback({msg: "invalid_merchant_id"})

          Merchants.findOne({id: params.merchantId, deleted: false}).exec(function (err, merchant) {
            if (err || !merchant)
              return callback({msg: "no_merhant_found"})
            merchantObj = merchant
            callback(null)
          })
        },
        function verifyToken(callback) {
          jwt.verify(params.token, merchantObj.secret, function (err, decoded) {
            if (err)
              return callback({msg: "token_not_valid_expired"})

            if (decoded.id === undefined || !customValidation.isValideId(decoded.id))
              return callback({msg: "invalid_transaction_id"})

            if (decoded.msisdn === undefined || decoded.msisdn != merchantObj.msisdn)
              return callback({msg: "invalid_merchant_id"})

            callback(null, decoded.id)
          })
        },
        function findTransaction(id, callback) {
          Transactions.findOne({id: id}).populate("to").exec(function (err, transaction) {
            if (err || transaction === undefined)
              return callback({msg: "invalid_transaction_id"})
            callback(null, transaction)
          })
        },
        function validateTransaction(transaction, callback) {
          customValidation.validateTransactionTimeStamp(transaction, function (err) {
            if (err)
              return callback(err)

            if (transaction.newBalance){
              delete transaction.newBalance
            }

            return res.json(transaction)
          })
        }
      ],
      function (err) {
        if (err) {
          err.msg = err.msg != undefined ? req.__(err.msg) : req.__("unknown_error")
          return res.json({err: err})
        }
        return res.json({err: "system_error_cannot_find_transaction"})
      })
  },

  /**
   * `TransactionController.pay()`
   */
  pay: function (req, res) {

    var params = req.params.all();
    sails.log.info('pay function params: ' + JSON.stringify(params));
    var transaction;
    var merchantObj;

    async.waterfall([
        function findTransaction(callback) {
          //validate transaction id
          if (!customValidation.isValideId(params.id))
            return callback({msg: "invalid_transaction_id"})

          Transactions.findOne({id: params.id}).populate("to").exec(function (err, trans) {
            if (trans === undefined)
              return callback({msg: "invalid_transaction_id"})

            //set transaction value
            transaction = trans
            sails.log.info('pay function transaction: ' + JSON.stringify(transaction));
            if (trans.status != "pending")
              return callback({msg: "transaction_already_submitted"})

            if (params.lang != undefined) {
              trans.lang = params.lang
              trans.save(function (err, trans) {
              })
            }
            callback(null)
          })
        },
        function validateTransactionTimeStamp(callback) {
          return customValidation.validateTransactionTimeStamp(transaction, callback)
        },
        function findMerchants(callback) {
          if (!transaction.to.id)
            return callback({msg: "no_merhant_found"});

          Merchants.findOne({id: transaction.to.id, deleted: false}).exec(function (err, merchant) {
            if (err || !merchant)
              return callback({msg: "no_merhant_found"})
            merchantObj = merchant
            callback(null)
          });
        },
        function setLang(callback){

          //set local
          if (transaction.lang != undefined)
            req.setLocale(transaction.lang)

          var payByReference = false;
          if (typeof merchantObj.pay_by_reference!="undefined")
            payByReference = merchantObj.pay_by_reference;

          var QRCode = require('qrcode')
          var path = require('path');

          var imagePath = path.resolve(__dirname);
          var imageName = transaction.referenceNumber;
          var fullQrImagePath = imagePath+'/../../assets/images/qr/'+imageName+'.png';
          var fullTempQrImagePath = imagePath+'/../../.tmp/public/images/qr/'+imageName+'.png';
          if (payByReference){
            QRCode.toFile(fullQrImagePath, JSON.stringify({ "qrtype":"REFNUMBER" , "REFNUMBER": transaction.referenceNumber}), {
              "type":"png"
            }, function (err) {
              if (err) throw err
                var fs = require('fs');
                fs.createReadStream(fullQrImagePath).pipe(fs.createWriteStream(fullTempQrImagePath));
            });
          }
          sails.log.info('before opening pay view');
          sails.log.info('id' + params.id);
          sails.log.info('transaction: ' + JSON.stringify(transaction));
          sails.log.info('payByReference: ' + JSON.stringify(payByReference));
          return res.view('Transactions/pay', {
            id: params.id,
            transaction: transaction,
            payByReference:payByReference,
            fullQrImagePath:'/images/qr/'+imageName+'.png'
          })
        },
      ],
      function (err) {
        if (err) {
          err.msg = err.msg != undefined ? err.msg : "unknown_error"

          //set local
          if (transaction != undefined)
            req.setLocale(transaction.lang)

          return res.view('Transactions/error', {
            error: err.msg,
            details: err.details != undefined ? err.details : "",
            transaction: transaction != undefined ? transaction : ""
          })
        }
        return res.serverError()
      })
  },

  /**
   * `TransactionController.processing()`
   */
  processing: function (req, res) {

    var params = req.params.all()
    var transaction

   async.waterfall([
        function validation(callback) {
          customValidation.validateProcessingData(params, callback)
        },
        /*function checkCaptcha(data, callback) {
          var secretKey = sails.config.connections.secretKey;
          // Hitting GET request to the URL, Google will respond with success or error scenario.
          var http = require('https'), options = {
            host: "www.google.com",
            port: 443,
            path: "/recaptcha/api/siteverify?secret=" + secretKey + "&response=" + params.g_recaptcha_response + "&remoteip=" + req.connection.remoteAddress,
            method: 'GET'
          };

          var result = "";
          var requestCallback = function (response) {
            response.on('data', function (chunk) {
              result += chunk;
            });
            response.on('end', function () {
              try {
                var body = JSON.parse(result);
                // Success will be true or false depending upon captcha validation.
                if (body.success !== undefined && body.success && body.success === true) {
                  return callback()
                }
                return callback({msg: "validation_captcha"})
              } catch (e) {
                return callback({msg: "validation_captcha"})
              }
            });
          }
          var requestCaptcha = http.get(options, requestCallback)
          requestCaptcha.end();
        },*/
        // check if user has reached the max number of login attempts for this account
        function checkIfAccountIsBlocked(callback) {
          myCache.get(params.phonenumber.toString(), function(err, value) {
            if (!err) {
              if (value !== undefined) {
                if (parseInt(value.login_attempts) >= sails.config.connections.maxFailedLoginAttempts) {
                  var current_date = new Date();
                  var block_date = new Date(value.last_failed_login);
                  block_date.setMinutes(block_date.getMinutes() + sails.config.connections.unlockLoginAfter);

                  if (block_date >= current_date) {
                    var obj = {
                      last_failed_login: new Date(),
                      login_attempts: value.login_attempts
                    };
                     // save object in cache
                    myCache.set(params.phonenumber.toString(), obj);
                    return callback({msg: 'account_locked'});
                  } else {
                    myCache.del(params.phonenumber.toString())
                    return callback(null);
                  }
                }
              }
              return callback(null);
            }
          })
        },
        function findTransaction(callback) {
          Transactions.findOne({id: params.id}).populate('to').exec(function (err, trans) {
            if (trans === undefined)
              return callback({msg: "invalid_transaction_id"})

            //set translation variable
            transaction = trans;
            sails.log.info('get function transaction: ' + JSON.stringify(transaction));

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
          request.payload.requester.accessValue = params.phonenumber
          request.payload.requester.password = params.pin
          request.payload.requester.accessMedium = "USSD"
          sails.log.info('get My Eligible SoF request : ' +  JSON.stringify(request));
          //initiate the getMyEligibleSoF API
          client.getMyEligibleSoF(request, function (err, result, body) {
            sails.log.info("Body: " + JSON.stringify(body));
            if (err) {
              var login_attempts = 0;
              // try to get key from cache if available
              myCache.get(params.phonenumber.toString(), function (err, value) {
                if (!err) {
                  // get the number of login attempts if available
                  if (value !== undefined) {
                    login_attempts = value.login_attempts;
                  }
                  var obj = {
                    last_failed_login: new Date(),
                    login_attempts: login_attempts += 1
                  };

                  myCache.set(params.phonenumber.toString(), obj);
                }
              });

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
              if (err) {
                return callback(err)
              }
              return callback(null)
            })
        },
        function sendOtp(callback) {
          sails.log.info('sending OTP');
          transaction.otp = math.randomInt(1000, 9999)
          sails.log.info(sails.config.connections.UAT);
          sails.log.info(sails.config.connections.UAT == true);
          if(sails.config.connections.UAT == true){
            transaction.otp = 1111;
          }
          sails.log.info(transaction.otp);
          var session = smpp.connect(sails.config.connections.smsGateway);
          session.bind_transceiver({
            system_id: sails.config.connections.username,
            password: sails.config.connections.password,
            system_type: 'SMPP',
            interface_version: 52
          }, function (pdu) {
            if (pdu.command_status == 0) {
              // Successfully bound
              session.submit_sm({
                source_addr_ton: 5,
                source_addr_npi: 0,
                dest_addr_ton: 1,
                dest_addr_npi: 1,
                source_addr: "ZainCash",
                destination_addr: params.phonenumber.toString(),
                short_message: "Your One-Time Password is : " + transaction.otp.toString()
              }, function (pdu) {
                if (pdu.command_status == 0) {
                  // Message successfully sent
                  return callback(null)
                }
                else {
                  return callback({msg: "sending_otp_error"})
                }
              });
            }
            else {
              return callback({msg: "sending_otp_error"})
            }
          });
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
                'msisdn': params.phonenumber.toString(),
                'amount': transaction.amount.toString()
              }
            },function (error, response, body) {
              sails.log.info('requestDiscount error: ' + JSON.stringify(error));
              sails.log.info('requestDiscount response: ' + JSON.stringify(response));
              sails.log.info('requestDiscount body: ' + JSON.stringify(body));
              var newAmount=parseInt(body);
              sails.log.info("new Ammount: " + JSON.stringify(newAmount));
              if (parseInt(transaction.amount)!=newAmount)
              {
                transaction.traveldiscount=transaction.amount
              }
              if(!Number.isNaN(newAmount) && newAmount !== undefined && newAmount !== "" && newAmount !== '' && newAmount !== null){
                transaction.amount=newAmount;
              }
              sails.log.info('transaction new ammount: ' + JSON.stringify(transaction));
              transaction.save();
              //populate parameters
              esj.merchantPaymentComputeServiceChargeRequest.payload.requester.accessMedium = "USSD"
              esj.merchantPaymentComputeServiceChargeRequest.payload.requester.accessValue = params.phonenumber
              esj.merchantPaymentComputeServiceChargeRequest.payload.requester.password = params.pin
              esj.merchantPaymentComputeServiceChargeRequest.payload.amount = parseInt(transaction.amount* 100000)
              esj.merchantPaymentComputeServiceChargeRequest.payload.targetOperationType = "MERCHANT_PAYMENT"
              esj.merchantPaymentComputeServiceChargeRequest.payload.debitedActor.identifier = transaction.sofOwnerId
              esj.merchantPaymentComputeServiceChargeRequest.payload.debitedSofId = transaction.sofId
              esj.merchantPaymentComputeServiceChargeRequest.payload.creditedActor.identifier = transaction.to.msisdn.toString()

              //initiate the computeServiceCharge API
              sails.log.info('initiate the computeServiceCharge API');
              sails.log.info(JSON.stringify(esj.merchantPaymentComputeServiceChargeRequest));
              client.computeServiceCharge(esj.merchantPaymentComputeServiceChargeRequest, function (err, result, body) {
                sails.log.info("Body: " + JSON.stringify(body));
                if (err)
                  esj.parseTncErrors(body, function (error, errorValue) {
                    return callback({msg: error ? error : errorValue})
                  })
                else
                  esj.parseFeeValue(body, function (error, fee, onMerchant, onCustomer) {
                    if (error)
                      return callback({msg: error})
                    transaction.totalFees = parseInt(parseInt(fee) / 100000)
                    transaction.onCustomerFees = onCustomer.toString()
                    transaction.onMerchantFees = onMerchant.toString()
                    return callback(null)
                  })
              }, {timeout: esj.requestTimeOut})





            })
          // End of travel discount ----






        },
        function updateTransaction(callback) {
          //update transaction

          transaction.status = "pending_otp"
          transaction.from = params.phonenumber.toString()

          transaction.save(function (err) {
            if (err)
              return callback({msg: "transaction_completion_error", details: err})
            else {
              myCache.del(params.phonenumber.toString())
              if (transaction.hasOwnProperty('traveldiscount'))
              {
                return res.json({
                  success: 1,
                  transactionid: params.id,
                  initialAmount: transaction.amount,
                  totalFees: parseInt(transaction.totalFees),
                  discount: transaction.traveldiscount,
                  total: parseInt(transaction.totalFees) + parseInt(transaction.amount),
                  onCustomerFees : transaction.onCustomerFees,
                  onMerchantFees : transaction.onMerchantFees,
                })
              }
              return res.json({
                success: 1,
                transactionid: params.id,
                initialAmount: transaction.amount,
                totalFees: parseInt(transaction.totalFees),
                total: parseInt(transaction.totalFees) + parseInt(transaction.amount),
                onCustomerFees : transaction.onCustomerFees,
                onMerchantFees : transaction.onMerchantFees,
              })
            }
          })



        },
      ],
      function (err, result) {

        msgToReturn = err.msg != undefined ? err.msg : err

        //update transaction
        if (transaction != undefined) {
          transaction.status = "failed"
          transaction.due = msgToReturn
          transaction.from = params.phonenumber.toString()
          transaction.save(function (err, trans) {
            //return error
            if (transaction.redirectUrl != undefined && transaction.redirectUrl != "") {
              jwt.sign({
                status: "failed", msg: msgToReturn,
                orderid: transaction.orderId ? transaction.orderId : "", id: params.id
              }, transaction.to.secret, {expiresIn: '1h'}, function (err, token) {
                return res.json({success: 0, url: utils.buildRedirectUrl(transaction.redirectUrl,token)})
              })
            }
            else
              return res.json({success: 0, error: req.__(msgToReturn)})
          })
        }
        else
          return res.json({success: 0, error: req.__(msgToReturn)})
      })
  },
  /**
   * `TransactionController.processingOTP()`
   */
  processingOTP: function (req, res) {

    var params = req.params.all()
    var transaction
    var secret
    var otp = params.otp;
    async.waterfall([
        function validation(callback) {
          customValidation.validateProcessingOtpData(params, callback)
        },
        function findTransaction(data, callback) {
          Transactions.findOne({id: params.id}).populate('to').exec(function (err, trans) {
            if (trans === undefined)
              return callback({msg: "invalid_transaction_id"})

            //set translation variable
            transaction = trans
            secret = transaction.to.secret
            //set local
            if (transaction.lang != undefined)
              req.setLocale(transaction.lang)

            if (trans.status != "pending_otp")
              return callback({msg: "transaction_already_submitted"})
             var otp = params.otp;
	    if (trans.otp != otp)
              return callback({msg: "incorrect_otp"})

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
          esj.merchantPaymentRequest.payload.debitedSofId = transaction.sofId
          esj.merchantPaymentRequest.payload.requester.accessValue = transaction.from
          esj.merchantPaymentRequest.payload.requester.password = params.pin.toString()
          esj.merchantPaymentRequest.payload.requester.accessMedium = "USSD"
          esj.merchantPaymentRequest.payload.quantity = parseInt(transaction.amount + '00000')
          esj.merchantPaymentRequest.payload.beneficiary.identifier = transaction.to.msisdn.toString()
          sails.log.info('initiate the merchantPayment API');
          sails.log.info(JSON.stringify(esj.merchantPaymentRequest));
          client.merchantPayment(esj.merchantPaymentRequest, function (err, result, body) {
            sails.log.info("Body: " + JSON.stringify(body));
            if (err) {
              esj.parseTncErrors(body, function (error, errorValue) {
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
          //update transaction
          transaction.status = "completed";
          transaction.operationId = data.operationId.toString();
          transaction.newBalance = data.newbalance;
          transaction.operationDate = typeof data.operationDate != "undefined" ? new Date(parseInt(data.operationDate)) : new Date();

          try {
            payment.paymentTrigger(transaction);
          } catch (error) {
            sails.log.info('payment trigger error' + JSON.stringify(error));
            sails.log.error("BASE_TRANSACTION_FAILED_TO_CALL_PAYMENT_TRIGGER_API", error);
          }

          transaction.save(function (err) {
            if (err){
              return callback({msg: "transaction_completion_error", details: err})
            }
            else if (transaction.redirectUrl != undefined && transaction.redirectUrl != ""){
              jwt.sign({
                status: "success",
                orderid: transaction.orderId ? transaction.orderId : "",
                id: params.id,
                operationid:transaction.operationId,
                msisdn:transaction.from
              }, secret, {
                expiresIn: '4h'
              }, function (err, token) {
                return res.redirect(utils.buildRedirectUrl(transaction.redirectUrl,token))
              })
            }
            else{
              var redirectUrl = "";
              if (transaction.redirectUrl)
                redirectUrl = transaction.redirectUrl;
              return res.view('Transactions/success', {
                newbalance: utils.formatMoney(Number(data.newbalance.slice(0, -5)), 2, '.', ','),
                total: parseInt(transaction.totalFees) + parseInt(transaction.amount),
                transactionid: params.id,
                redirectUrl:redirectUrl
              });
            }
          })
        },
      ],
      function (err, result) {

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
                return res.view('Transactions/error', toReturn)
              })
            }
            else
              return res.view('Transactions/error', toReturn)
          })
        }
        else
          return res.view('Transactions/error', toReturn)
      })
  },

  getNearestAgents : function(req,res){
    var params = req.params.all()
    var request = require('request');
    var options = {
      url:sails.config.connections.apiUrl+"/api/v1/agents/get-nearest?longitude="+params.lng+"&latitude="+params.lat,
      headers: {
        'x-device-uid':'uid_1234',
        'x-platform': 'web',
        'x-lang': params.lang,
        'x-agent': 'mozilla 50.0.0, web, Firefox 60, 1.0, 3x'
      }
    };

    function callback(error, response, body) {
      if (!error && response.statusCode == 200) {
        var info = JSON.parse(body);
        return res.json({success: 1, data: info});
      }
    }

    request(options, callback);

  },

  // sendSMS : function(req,res){
  //    var queue = require('bulkhead-kue');
  //    var params = req.params.all()

  //   queue.create('SMPP', 'Send SMS', {name: 'sms'}, function (results, job) {
  //     sails.log.info("Inside Send Otp ");
  //     var session = smpp.connect(sails.config.connections.smsGateway);
  //     console.log("session ", session);
  //     sails.log.info("sms gate aways  " + sails.config.connections.smsGateway);
  //     sails.log.info("session " + session.toString());
  //     console.log("session  --" + session);
  //     session.bind_transceiver({
  //       system_id: sails.config.connections.username,
  //       password: sails.config.connections.password,
  //       system_type: 'SMPP',
  //       interface_version: 52
  //     }, function (pdu) {
  //       sails.log.info("before establishing session")
  //       for (var k in smpp.errors) {
  //         if (smpp.errors[k] == pdu.command_status) {
  //           sails.log.info("smpp Error " + k);
  //         }
  //       }
  //       if (pdu.command_status == 0) {
  //         sails.log.info("smsc : established session")
  //         // Successfully bound
  //         session.submit_sm({
  //           source_addr_ton: 5,
  //           source_addr_npi: 0,
  //           dest_addr_ton: 1,
  //           dest_addr_npi: 1,
  //           source_addr: "ZainCash",
  //           destination_addr: params.phonenumber,
  //           short_message: "The reference Number of ZainCash transaction is : " + params.reference_number
  //         }, function (pdu) {
  //           if (pdu.command_status == 0) {
  //             sails.log.info("smsc : sms sent")
  //             // Message successfully sent
  //             res.json({"success":1});
  //           }
  //           else {
  //             sails.log.info("smsc : error sending sms")
  //             return res.json({"success":0,"msg":"error sending sms"});
  //           }
  //         });
  //       }
  //       else {
  //         sails.log.info("smsc : error in session");
  //         return res.json({"success":0,"msg":"error in session SMS"});
  //       }
  //     });
  //   }, function (err, results) {
  //     // Callback that is fired when the job is saved into the queue
  //     console.log(results.response().name) // Outputs 'sms'
  //   });

  //   queue.process('SMPP', 'Send SMS', null, function (job, next) {
  //     job.attempts(3);
  //     // Callback that is fired per job being processed
  //     console.log(job.data.name); // Outputs 'sms'
  //     next(undefined, job.data); // Moves on to the next job to process
  //   });


  // },

  sendEmail : function(req,res){
    var params = req.params.all();
    var request = require('request');


    function callback(error, response, body) {
      if (!error && response.statusCode == 200) {
         try {
            var info = JSON.parse(body);
            return res.json({success: 1, data: info});
        } catch (e) {
            return res.json({success: 0, msg: "Cannot send the email!"});
        }
      }
    }

    jwt.sign({
      "email":params.email,
      "message":"ZainCash reference Number is: "+params.reference_number
    }, "5e}V~$m59M9*7.d_", {expiresIn: '1h'}, function (err, token) {
      var options = {
        url: sails.config.connections.apiUrl+"/web/v1/send/email",
        headers: {
          'x-device-uid':'uid_1234',
          'x-platform': 'web',
          'x-lang': req.getLocale(),
          'x-agent': 'mozilla 50.0.0, web, Firefox 60, 1.0, 3x',
          'Authorization': 'bearer '+token
        }
      };
      request(options, callback);
    })
  },

  getTransactionByRef : function(req,res){
    console.log(req.headers);
    var authorization = req.headers['authorization'];
    var token = authorization.split(' ');
    token = token[1];
     async.waterfall([
      function verifyToken(callback){
        jwt.verify(token, "5e}V~$m59M9*7.d_", function (err, decoded) {
          if (err)
            return callback({msg: "token_not_valid_expired"})

          callback(null, decoded)
        })
      },function getTransaction(decoded,callback){
        Transactions.findOne({referenceNumber: decoded.reference_number}).exec(function (err, trans) {
            if (err || trans === undefined)
              return callback({msg: err})

              return res.json({
                success: 1,
                transactionId: trans.id
              })
          })
      }],
      function (err) {
        if (err) {
          err.msg = err.msg != undefined ? req.__(err.msg) : req.__("unknown_error")
          return res.json({success:0,err: err.msg})
        }
        return res.serverError()
      });
  }

}

