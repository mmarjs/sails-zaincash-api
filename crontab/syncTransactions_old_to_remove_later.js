/**
 * Created by yjradeh on 8/11/16.
 */
var soap = require('soap');//Soap Library and XML parser
var moment = require('moment');

module.exports = {
  run: function () {

    //not used anymore
    return true;

    var client

    //add new log
    console.log('Sync Cron Started at ' + new Date());

    async.waterfall([
        function soapInit(callback) {
          soap.createClient(sails.config.connections.historyPaymentUrl, function (err, soapClient) {
            if (err)
              return callback({msg: "soap_connection_error"})
            client = soapClient
            return callback(null)
          })
        },
        function (callback) {
          Merchants.find({deleted: false}).exec(function (err, merchants) {
            if (err || !merchants)
              return callback({msg: "error retrieving merchants"})
            callback(null, merchants)
          })
        },
        function (merchants, callback) {
          async.each(
            merchants,
            function (merchant, ProcessingCallback) {
              console.log('=============>Processing sync for merchant ' + merchant.id);

              esj.getMyLastFinancialTransactionsRequest.payload.requester.accessValue = merchant.msisdn
              esj.getMyLastFinancialTransactionsRequest.payload.requester.password = 1111
              esj.getMyLastFinancialTransactionsRequest.payload.maxReturnResults = 100
              esj.getMyLastFinancialTransactionsRequest.payload.sourceOfFundsId = merchant.sofId

              //initiate the getMyLastFinancialTransactions API
              client.getMyLastFinancialTransactions(esj.getMyLastFinancialTransactionsRequest, function (err, result, body) {
                if (err)
                  esj.parseClientErrors(body, function (error, errorValue) {
                    return ProcessingCallback({msg: error ? error : errorValue})
                  })
                else
                  esj.parseTransactions(body, function (error, transactions) {
                    if (error)
                      return ProcessingCallback({msg: error})

                    async.each(
                      transactions,
                      function (transaction, findCallback) {
                        Transactions.findOne({
                          operationId: transaction.operationId[0],
                          to: merchant.id
                        }).exec(function (err, exist) {
                          if (err || exist)
                            return findCallback(null)
                          else {
                            var data = {
                              token: "processId=" + transaction.processId[0],
                              source: "sync",
                              type: transaction.operationType[0],
                              serviceType: transaction.operationType[0],
                              amount: Math.abs(transaction.operationAmount[0].slice(0, -5)),
                              credit: transaction.operationAmount < 0 ? true : false,
                              to: merchant,
                              operationId: transaction.operationId[0],
                              status: transaction.state[0] == "SUCCEEDED" ? "completed" : "error",
                              from: transaction.peer[0].preferredIdentifier[0],
                              createdAt: new Date(transaction.creationDate[0].slice(0, -3) * 1000)
                              // new Date(unix_timestamp*1000),
                              // new Date(unix_timestamp*1000)
                            }
                            Transactions.create(data).exec(function createCB(err, created) {
                              if (err)
                                return findCallback(err)
                              findCallback(null)
                            })
                          }
                        })
                      },
                      function (err) {
                        if (err)
                          return ProcessingCallback({msg: "<<<<<<<<<<<<<<<<<Sync failed" + merchant.id})
                        return ProcessingCallback(null)
                      });

                  })
              })
            },
            function (err) {
              return callback(null)
            }
          )
        }
      ],
      function (err) {
        if (err) {
          err.msg = err.msg ? err.msg : "unknown_error"
          return {success: false, err: err.msg}
        }
        console.log('All merchants sync have been processed successfully');
        return {success: true}
      })
  },
}
