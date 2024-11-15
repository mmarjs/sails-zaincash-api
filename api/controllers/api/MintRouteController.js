/**
 * TransferController
 *
 * @description :: Server-side logic for managing Transaction
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var soap = require('soap'),
  smpp = require('smpp');
module.exports = {

  /**
   * `TransferController.preview()`
   *
   */
  preview: function (req, res) {
    var params = req.params.all()
    var transaction, merchantObj

    if (!params.pin || !params.amount || !params.product_code || !params.product_name) {
      return res.json(401, {err: 'missing_parameters'});
    }

    if (!req.token.phonenumber)
      return res.json(401, {err: 'user_phonenumber_not_valid'});

    async.waterfall([
        function findZainWallet(callback) {
          Merchants.findOne({
            id: sails.config.connections.zainMintrouteWalletMerchantId,
            deleted: false
          }).exec(function (err, merchant) {
            if (err || !merchant)
              return callback({msg: "merhant_not_found"})

            merchantObj = merchant
            callback(null)
          })
        },
        function saveNewTransaction(callback) {

          if (parseInt(params.amount) < sails.config.connections.minAmount)
            return callback({msg: "invalid_transfer_amount"})

          //get authorization from the header
          parts = req.headers.authorization.split(' ')
          token = parts[1]

          var data = {
            token: token,
            source: "mobile",
            type: "MERCHANT_PAYMENT",
            from: req.token.phonenumber,
            amount: params.amount,
            to: merchantObj,
            serviceType: "MintRoute",
            product: {
              code: params.product_code,
              name: params.product_name,
              type: "MintRoute"
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
            else
              return res.json({
                success: 1,
                transactionId: transaction.id,
                totalFees: parseInt(transaction.totalFees),
                amount: parseInt(transaction.amount),
                total: parseInt(transaction.totalFees) + parseInt(transaction.amount),
                product: transaction.product
              })
          })
        }],
      function (err, result) {
        sails.log('ESERV ERROR ' + err.msg)
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
    var serial_mint=params.serial;
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
          transaction.status='confirmed_and_in_process'
          transaction.save(function (err) {
            sails.log.info("confirming transaction");
          })
          soap.createClient(sails.config.connections.merchantPaymentUrl, function (err, client) {
            if (err)
              return callback({msg: "soap_connection_error"})

            //populate parameters
            esj.merchantPaymentRequest.payload.requester.accessValue = req.token.phonenumber
            esj.merchantPaymentRequest.payload.requester.password = pin.toString()
            esj.merchantPaymentRequest.payload.quantity = parseInt(transaction.amount.toString() + '00000')
            esj.merchantPaymentRequest.payload.debitedSofId = transaction.sofId
            esj.merchantPaymentRequest.payload.beneficiary.identifier = transaction.to.msisdn.toString()
            esj.merchantPaymentRequest.payload.comment = serial_mint

            //initiate the merchantPayment API
            client.merchantPayment(esj.merchantPaymentRequest, function (err, result, body) {
              esj.merchantPaymentRequest.payload.comment ='Mintroute Merchant Payment'
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
          transaction.comment = "MERCHANT_PAYMENT_FROM_MOBILE";
          transaction.operationId = data.operationId.toString();
          transaction.newBalance = data.newbalance;
          transaction.operationDate = typeof data.operationDate != "undefined" ? new Date(parseInt(data.operationDate)) : new Date();

          try {
            payment.paymentTrigger(transaction);
          } catch (error) {
            sails.log.error("MIN_ROUTE_FAILED_TO_CALL_PAYMENT_TRIGGER_API", error);
          }

          transaction.save(function (err) {
            if (err)
              return callback({msg: "transaction_completion_error", details: err})
          })
          return res.json({
            success: 1,
            transaction: transaction
          })
        },
      ],
      function (err, result) {
        sails.log('ESERV ERROR ' + err.msg)
        return res.json({success: 0, err: err.msg})
      })
  },

  /**
   * `TransferController.preview()`
   *
   */
  update: function (req, res) {
    var params = req.params.all()
    var transactionId = params.transactionId;
    var transaction

    if (!req.token.phonenumber)
      return res.json(401, {err: 'user_phonenumber_not_valid'});
    if (!params.transactionId)
      return res.json(401, {err: 'missing_parameters'})

    async.waterfall([
        function validateTransaction(callback) {
          Transactions.findOne({id: transactionId}).populate("to").exec(function (err, trans) {
            if (err || !trans)
              return callback({msg: "invalid_transaction_id"})

            transaction = trans
            sails.log.info("validated transaction");
            callback(null)
          })
        },
        function updateTransaction(callback) {
          //update transaction
          transaction.mintroute = {secret: params.secret, serial: params.serial}
          transaction.save(function (err) {
            if (err)
              return callback({msg: "transaction_completion_error", details: err})
             return res.json({ success: 1, transaction: transaction })
            console.log("transaction updated  ", transaction)
            return callback(null);
          })
        }
        /*function sendOtp(callback) {
          sails.log.info("insidde Send Otp :" + params.sms);
          if (params.sms) {
            sails.log.info("sms params " + params.sms);
            var queue = require('bulkhead-kue');
            queue.create('SMPP', 'Send Mintroute SMS', {name: 'sms'}, function (results, job) {
              sails.log.info("Inside Send Otp ");
              var session = smpp.connect(sails.config.connections.smsGateway);
              console.log("session ", session);
              session.bind_transceiver({
                system_id: sails.config.connections.username,
                password: sails.config.connections.password,
                system_type: 'SMPP',
                interface_version: 52
              }, function (pdu) {
                sails.log.info("before establishing session")
                if (pdu.command_status == 0) {
                  sails.log.info("smsc : established session")
                  // Successfully bound
                  session.submit_sm({
                    source_addr_ton: 5,
                    source_addr_npi: 0,
                    dest_addr_ton: 1,
                    dest_addr_npi: 1,
                    source_addr: "ZainCash",
                    destination_addr: req.token.phonenumber.toString(),
                    short_message: params.sms
                  }, function (pdu) {
                    if (pdu.command_status == 0) {
                      // Message successfully sent
                      // return res.json({success: 1, transaction: trans})
                    } else {
                      sails.log.info("smsc : error sending sms")
                      return callback({msg: "sending_otp_error"})
                    }
                  });
                } else {
                  sails.log.info("smsc : error in session");
                  return callback({msg: "sending_otp_error"})
                }
              });
            }, function (err, results) {
              // Callback that is fired when the job is saved into the queue
              console.log(results.response().name) // Outputs 'sms'
            });
            queue.process('SMPP', 'Send Mintroute SMS', null, function (job, next) {
              job.attempts(3)
              // Callback that is fired per job being processed
              console.log(job.data.name) // Outputs 'bob'
              next(undefined, job.data); // Moves on to the next job to process
            })
            return res.json({success: 1, transaction: transaction})
          } else {
            sails.log.info("no sms params returning success");
            return res.json({success: 1, transaction: transaction})
          }
        },
	function sendFeedback(callback) {
          return res.json({success: 1, transaction: transaction})
        }*/
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
          sails.log.info('initiate the getMyEligibleSoF API');
          sails.log.info(JSON.stringify(request));
          client.getMyEligibleSoF(request, function (err, result, body) {
            sails.log.info("Body: " + JSON.stringify(body));
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
          sails.log.info('initiate the getMySoFBalance API');
          sails.log.info(JSON.stringify(request));
          soapClient.getMySoFBalance(request, function (err, result, body) {
            sails.log.info("Body: " + JSON.stringify(body));
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
            return res.json({success: 1, balance: balance.slice(0, -5), transaction: transaction,sofId: sofId})
          })
        }],
      function (err, result) {
        sails.log('ESERV ERROR ' + err.msg)
        return res.json({success: 0, err: err.msg});
      })
  }
}

