/**
 * TransferController
 *
 * @description :: Server-side logic for managing Transaction
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var soap = require('soap');

module.exports = {

  /**
   * `TransferController.preview()`
   *
   */
  preview: function (req, res) {
    var params = req.params.all()
    var transaction

    if (!params.pin || !params.phoneTo) {
      return res.json(401, {err: 'missing_parameters'});
    }

    if (!params.amount || parseInt(params.amount) < sails.config.connections.minAmount)
      return callback({msg: "invalid_transfer_amount"})

    if (!req.token.phonenumber)
      return res.json(401, {err: 'user_phonenumber_not_valid'});

    async.waterfall([
        function saveNewTransaction(callback) {

          //get authorization from the header
          parts = req.headers.authorization.split(' ')
          token = parts[1];
          params.amount = parseInt(params.amount);
          
          var data = {
            token: token,
            from: req.token.phonenumber,
            source: "mobile",
            type: "DOMESTIC_TRANSFER",
            amount: params.amount,
            transfer_to: params.phoneTo,
            serviceType: "DOMESTIC_TRANSFER",
            comment: params.memo ? params.memo : ""
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
          //populate parameters
          esj.computeServiceChargeRequest.payload.requester.accessValue = req.token.phonenumber
          esj.computeServiceChargeRequest.payload.requester.password = params.pin
          esj.computeServiceChargeRequest.payload.amount = parseInt(params.amount + '00000')
          esj.computeServiceChargeRequest.payload.targetOperationType = "DOMESTIC_TRANSFER"
          esj.computeServiceChargeRequest.payload.debitedActor.identifier = transaction.sofOwnerId
          esj.computeServiceChargeRequest.payload.debitedSofId = transaction.sofId
      
          //initiate the computeServiceCharge API
          client.computeServiceCharge(esj.computeServiceChargeRequest, function (err, result, body) {
          
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
                phoneTo: parseInt(transaction.transfer_to),
                total: parseInt(transaction.totalFees) + parseInt(transaction.amount),
                comment: transaction.comment
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
    var transaction

    if (!req.token.phonenumber)
      return res.json(401, {err: 'user_phonenumber_not_valid'});

    if (!transactionId || !pin)
      return res.json(401, {err: 'missing_parameters'});

    async.waterfall([
        function validateTransaction(callback) {
          Transactions.findOne({id: transactionId}, function (err, trans) {
            if (err || !trans)
              return callback({msg: "invalid_transaction_id"})

            if (!trans.transfer_to)
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
            esj.domesticTransferRequest.payload.requester.accessValue = req.token.phonenumber
            esj.domesticTransferRequest.payload.requester.password = pin.toString()
            esj.domesticTransferRequest.payload.quantity = parseInt(transaction.amount.toString() + '00000')
            esj.domesticTransferRequest.payload.debitedSofId = transaction.sofId
            esj.domesticTransferRequest.payload.beneficiary.identifier = transaction.transfer_to
            esj.domesticTransferRequest.payload.comment = "DOMESTIC_TRANSFER_FROM_MOBILE"

            //initiate the domesticTransfer API
            client.domesticTransfer(esj.domesticTransferRequest, function (err, result, body) {
              if (err) {
                esj.parseTncErrors(body, function (error, errorValue) {
                  return callback({msg: error ? error : errorValue})
                })
              }
              else {
                esj.parseDomesticTransfer(body, function (error, data) {
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
            sails.log.error("TRANSFER_FAILED_TO_CALL_PAYMENT_TRIGGER_API", error);
          }

          transaction.save(function (err) {
            if (err)
              return callback({msg: "transaction_completion_error", details: err})

            return res.json({
              success: 1,
              transaction: transaction,
              newBalance: utils.formatMoney(Number(data.newbalance.slice(0, -5)), 2, '.', ','),
            })
          })
        },
      ],
      function (err, result) {
        sails.log('ESERV ERROR ' + err.msg)
        return res.json({success: 0, err: err.msg})
      })
  }
}

