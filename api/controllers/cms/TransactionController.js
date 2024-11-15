  /**
 * TransactionController
 *
 * @description :: Server-side logic for managing Transaction
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var soap = require('soap');
var moment = require('moment-timezone');

module.exports = {

  /**
   * `TransactionController.search()`
   *
   */
  search: function (req, res) {
    var params = req.params.all()
    var page = params.page != undefined ? parseInt(params.page) : 1;
    var limit = params.limit != undefined ? parseInt(params.limit) : 20;
    var merchantId = req.token.merchantId != undefined ? req.token.merchantId : false;
    merchantId = params.merchantId != undefined ? params.merchantId : merchantId;
    var timezone = params.timezone != undefined ? params.timezone : 'Asia/Baghdad';
    var msisdn
    var serviceType = params.serviceType != undefined ? params.serviceType : false
    var or = [{}]
    var filter = {status: 'completed'}
    var dateFilter = {}

    if (!merchantId) {
      return res.json(401, {err: 'Invalid merchant Id'});
    }

    async.waterfall([
        function findMerchant(callback) {
          Merchants.findOne({id: merchantId, deleted: false}).exec(function (err, merchant) {
            if (err || !merchant)
              return callback({msg: "no_merhant_found"})

            msisdn = merchant.msisdn
            callback(null)
          })
        },
        function findTransaction(callback) {
          var dateFrom, dateTo;

          if (params.datefrom) {
            dateFrom = moment.tz(params.datefrom + ' 00:00:00',timezone).toDate();
            sails.log.info('dateFrom: ' + dateFrom);
          }

          if (params.dateto) {
            dateTo = moment.tz(params.dateto + ' 23:59:59',timezone).toDate();
            sails.log.info('dateTo: ' + dateTo);
          }

          if (params.search) {
            or = [
              {serviceType: {contains: params.search}},
              {operationId: {contains: params.search}},
              {amount: {contains: params.search}},
              {type: {contains: params.search}}
            ]
          }
          if (params.customer) {
            filter.from = {contains: params.customer}
          }

          if (params.datefrom || params.datefrom) {
            if (params.datefrom) {
              dateFilter['>='] = dateFrom;
            }
            if (params.dateto) {
              dateFilter['<='] = dateTo;
            }

            filter.operationDate = dateFilter;
          }

          if (serviceType && serviceType != -1) {
            filter.serviceType = serviceType;
          }

          //if id exist ignore the other criteria
          if (params.id) {
            filter = {to: merchantId, id: params.id}
          }


         var where = {
            $and: [
              {
                $or: [
                  {to: merchantId},
                  {transfer_to: msisdn.toString()},
                  {from: msisdn.toString()}]
              },
              {$or: or},
              filter
            ],
          }

          sails.log.info('Where filter: ' + JSON.stringify(where));

           Transactions.find().where(where).populate("to").sort(
              { operationDate: 'DESC' }
            ).paginate({
            page: page,
            limit: limit
          }).exec(function (err, records) {
            if (err || records === undefined)
              return callback({msg: "no_records_founds"})

            Transactions.count(where).exec(function countCB(error, found) {
              return res.json({results: records, count: found, page: page, limit: limit, where: where});
            });
          });

        }
      ],
      function (err) {
        if (err) {
          err.msg = err.msg != undefined ? err.msg : "unknown_error"
          return res.json({success: 0, err: err.msg});
        }
        return res.serverError()
      }
    )
  },

  /**
   * `TransactionController.exportToCSV()`
   *
   */
  exportToCSV: function (req, res) {
    var msisdn = ""
    var params = req.params.all()
    var merchantId = req.token.merchantId != undefined ? req.token.merchantId : false
    merchantId = params.merchantId != undefined ? params.merchantId : merchantId
    var serviceType = params.serviceType != undefined ? params.serviceType : false


    if (!params.year || !params.month) {
      return res.json({success: 0, err: "invalid params, month and year are required"});
    }


    async.waterfall([
        function findMerchant(callback) {
          Merchants.findOne({id: merchantId, deleted: false}).exec(function (err, merchant) {
            if (err || !merchant)
              return callback({msg: "no_merhant_found"})

            msisdn = merchant.msisdn
            callback(null)
          })
        },
        function findTransaction(id, callback) {

          var timezone = params.timezone != undefined ? params.timezone : 'Asia/Baghdad';
          var dateFrom = moment().date(1).month(params.month - 1).year(params.year).hours(0).minutes(0).seconds(0).format('YYYY-MM-DD HH:mm:ss');
          var dateTo = moment().date(0).month(params.month - 1).year(params.year).hours(23).minutes(59).seconds(59).format('YYYY-MM-DD HH:mm:ss');

          var filter = {
            $and: [
              {
                or: [
                  {to: merchantId},
                  {transfer_to: msisdn.toString()},
                  {from: msisdn.toString()}]
              },
              {status: "completed"},
              {
                or: [
                  {
                    operationDate: {
                      $exists: true,
                      '>=': moment.tz(dateFrom, timezone).toDate(),
                      '<=': moment.tz(dateTo, timezone).toDate()
                    }
                  }
                ]
              }
            ],
          }

          if (serviceType && serviceType != -1) {
            filter.serviceType = serviceType;
          }

          Transactions.find(filter).sort({operationDate: 'ASC'}).exec(function (err, records) {
            if (err || records === undefined)
              return callback({msg: "no_records_founds"})

            //(6) currency -exchange rate used if non IQD-(7) fields data, e.g., student number, policy number, etc. (8) operational ID from ESG
            var rows = []
            var productName;
            if (serviceType == 'MintRoute') {
              rows.push("Date,Transaction ID,Customer,Type,Service Type,Amount,Fees,Data,operational ID,Status,Transaction Source,Product Code,Product Name,MintRoute Serial")
            } else if (serviceType == 'ONECARD') {
              rows.push("Date,Transaction ID,Customer,Type,Service Type,Amount,Fees,Data,operational ID,Status,Transaction Source,Product Code,Product Name,OneCard Serial")
            } else if (serviceType == 'switch') {
              rows.push("Date,Transaction ID,Customer,Type,Service Type,Amount,Fees,Data,operational ID,Status,Transaction Source,Denomination,Card Number,Customer Name,Customer Mobile")
            } else {
              rows.push("Date,Transaction ID,Customer,Type,Service Type,Amount,Fees,Data,operational ID,Status,Transaction Source,cashier")
            }
            var checkServicetype =serviceType;
            async.each(records, function (r, eachCallback) {
              var date = r.operationDate ? r.operationDate : r.updatedAt;
              // var rate = (r.currencyConversion && r.currencyConversion.rate) ? r.currencyConversion.rate : ""
              var transactionId = r.id
              var data = (r.product && r.product.request) ? JSON.stringify(r.product.request).toString().replace(",", " | ") : ""
              var type = r.type.toString().replace("_", " ").toLowerCase()
              var amount = r.credit ? "-" + r.amount : r.amount
              var fees = r.totalFees ? r.totalFees : 0
              var operationId = r.operationId ? r.operationId.toString() : ""
              var d = date.toString().replace(/\S+\s(\S+)\s(\d+)\s(\d+)\s.*/, '$2-$1-$3');
              var serviceType = r.serviceType
              var status = r.status ? r.status : ""
              var transactionSource = r.source ? r.source : ""
              var customerName;
              var customerMobileNumber
              var productCode;
              var productSerial;

              if  (checkServicetype == 'MintRoute') {
                productName = r.product ? r.product.name : ""
                productCode = r.product ? r.product.code : ""
                productSerial = r.mintroute ? r.mintroute.serial : ""
                rows.push(d + "," + transactionId + "," + r.from + "," + type + "," + serviceType + "," + amount + "," + fees + "," + data + "," + operationId + "," + status + "," + transactionSource + "," + productCode + "," + productName + "," + productSerial)
              } else if (checkServicetype == 'ONECARD') {
                productName = r.product ? r.product.name : ""
                productCode = r.product ? r.product.code : ""
                productSerial = r.onecard ? r.onecard.serial : ""
                rows.push(d + "," + transactionId + "," + r.from + "," + type + "," + serviceType + "," + amount + "," + fees + "," + data + "," + operationId + "," + status + "," + transactionSource + "," + productCode + "," + productName + "," + productSerial)
              } else if (checkServicetype == 'switch') {
                 customerName = r.switch_info ? r.switch_info.first_name + " " +  r.switch_info.middle_name + " " + r.switch_info.last_name : ""
                 customerMobileNumber = r.switch_info ? r.switch_info.mobile : ""
                 productCode = r.switch_info ? r.switch_info.denomination : ""
                 var cardNumber = r.cardNumber ? r.cardNumber : ""
                 rows.push(d + "," + transactionId  + "," + r.from + "," + type + "," + serviceType + "," + amount + "," + fees + "," + data + "," + operationId + "," + status + "," + transactionSource + "," + productCode + "," + cardNumber + "," + customerName + "," + customerMobileNumber)
              } else {
                var cashier=r.cashier ? r.cashier : ""
                rows.push(d + "," + transactionId  + "," + r.from + "," + type + "," + serviceType + "," + amount + "," + fees + "," + data + "," + operationId + "," + status + "," + transactionSource + "," + cashier)
              }
              eachCallback()
            }, function (err) {
              if (err) return res.negotiate(err);
              return res.json({results: rows, filter: filter});
            });
          })
        }
      ],
      function (err) {
        if (err) {
          err.msg = err.msg != undefined ? err.msg : "unknown_error"
          return res.json({success: 0, err: err});
        }
        return res.serverError()
      }
    )
  }
  ,

  /**
   * `TransactionController.get()`
   *
   * Pull Phone balance from Eserv
   */
  partialRefund: function (req, res) {
    var transactionId = req.param('transactionId');
    var pin = req.param('pin');
    var amount = req.param('amount');
    var comment = req.param('comment');
    var merchantPhone = req.param('phone');

    var soapClient, merchant, transaction, newTransaction

    if (!transactionId || !pin || !amount || !comment) {
      return res.json(401, {err: 'transactionId, pin, amount and comment are required'});
    }

    async.waterfall([
        function validateMerchant(callback) {
          Merchants.findOne({id: req.token.merchantId, deleted: false}, function (err, merch) {
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
                    "to":req.token.merchantId
                  },
                  {
                    "transfer_to":merchantPhone
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

            if (!trans.amount || parseInt(amount) < sails.config.connections.minAmount)
              return callback({msg: "transaction_amount_cannot_be_refund"})

            if (parseInt(amount) > trans.amount)
              return callback({msg: "invalid_amount_value"})

            if (trans.status !== "completed")
              return callback({msg: "transaction_is_not_completed"})

            transaction = trans
            callback(null)
          })
        },
        function createNewTransaction(callback) {
          var data = {
            token: "MerchantId=" + req.token.merchantId,
            source: "web",
            type: "DOMESTIC_TRANSFER",
            status: "pending_refund",
            amount: parseInt(amount),
            credit: true,
            to: merchant,
            from: transaction.from,
            serviceType: "partial_refund",
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
        function transfer(callback) {
          soap.createClient(sails.config.connections.merchantPaymentUrl, function (err, client) {
            if (err)
              return callback({msg: "soap_connection_error"})

            //populate parameters
            esj.domesticTransferRequest.payload.requester.accessValue = merchant.msisdn
            esj.domesticTransferRequest.payload.requester.password = pin.toString()
            esj.domesticTransferRequest.payload.quantity = parseInt(amount.toString() + '00000')
            esj.domesticTransferRequest.payload.debitedSofId = merchant.sofId
            esj.domesticTransferRequest.payload.beneficiary.identifier = transaction.from.toString()
            esj.domesticTransferRequest.payload.comment = comment

            //initiate the domesticTransfer API
            sails.log.info('initiate the domesticTransfer API');
            sails.log.info(JSON.stringify(esj.domesticTransferRequest));
            client.domesticTransfer(esj.domesticTransferRequest, function (err, result, body) {
              sails.log.info("Body: " + JSON.stringify(body));
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
          newTransaction.status = "completed";
          newTransaction.comment = comment;
          newTransaction.operationId = data.operationId.toString();
          newTransaction.operationDate = typeof data.operationDate != "undefined" ? new Date(parseInt(data.operationDate)) : new Date();

          try {
            payment.paymentTrigger(newTransaction);
          } catch (error) {
            sails.log.error("PARTIAL_REFUND_FAILED_TO_CALL_PAYMENT_TRIGGER_API", error);
          }

          newTransaction.save(function (err) {
            if (err)
              return callback({msg: "transaction_completion_error", details: err})

            transaction.comment = transaction.comment ? transaction.comment + " (partial refunded)" : "(partial refunded)";
            transaction.save(function (err) {
              return res.json({
                success: 1,
                newbalance: utils.formatMoney(Number(data.newbalance.slice(0, -5)), 2, '.', ','),
                operationId: transaction.operationId
              })
            })
          })
        },
      ],
      function (err, result) {
        return res.json({success: 0, err: err.msg})
      })
  }
  ,

  /**
   * `TransactionController.reversal()`
   *
   * Pull Phone balance from Eserv
   */
  reversal: function (req, res) {
    var transactionId = req.param('transactionId');
    var pin = req.param('pin');
    var comment = req.param('comment');
    var merchantPhone = req.param('phone');

    var soapClient, merchant, transaction, newTransaction

    if (!transactionId || !pin || !comment) {
      return res.json(401, {err: 'transactionId, pin, amount and comment are required'});
    }

    async.waterfall([
        function validateMerchant(callback) {
          Merchants.findOne({id: req.token.merchantId, deleted: false}, function (err, merch) {
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
                    to:req.token.merchantId
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
          var data = {
            token: "MerchantId=" + req.token.merchantId,
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
            sails.log.info('initiate the domesticTransfer API');
            sails.log.info(JSON.stringify(esj.merchantPaymentReversalRequest));
            client.merchantPaymentReversal(esj.merchantPaymentReversalRequest, function (err, result, body) {
              sails.log.info("Body: " + JSON.stringify(body));
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
          newTransaction.operationDate = typeof data.operationDate != "undefined" ? new Date(parseInt(data.operationDate)) : new Date();

          try {
            payment.paymentTrigger(newTransaction);
          } catch (error) {
            sails.log.error("CMS_REVERSAL_FAILED_TO_CALL_PAYMENT_TRIGGER_API", error);
          }
          newTransaction.save(function (err) {
            if (err)
              return callback({msg: "transaction_completion_error", details: err})

            transaction.reversed = true;
            transaction.save(function (err) {
              return res.json({
                success: 1,
                newbalance: utils.formatMoney(Number(data.newbalance.slice(0, -5)), 2, '.', ','),
                operationId: transaction.operationId
              })
            })
          })
        },
      ],
      function (err, result) {
        return res.json({success: 0, err: err.msg})
      })
  }
}

