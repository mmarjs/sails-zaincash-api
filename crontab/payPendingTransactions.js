var soap = require('soap');//Soap Library and XML parser
var moment = require('moment');
var crypto = require('crypto');
const lockFile = './pay_lock.txt';
const fs = require('fs');

module.exports = {
  run: function () {
    if (fs.existsSync(lockFile)) {
      sails.log.info('already exist syncTransaction job');
      return {success: false, err: 'already exist syncTransaction job'}

    }
    fs.openSync(lockFile, 'w');
    // Find all pending transactions
    Transactions.find({
      serviceType: 'CASH_DISBURSEMENT',
      status: 'pending'
    }).exec(function (err, trans) {
      if (err) {
        if (fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
        }
        return {sucess: false, err: 'missing or invalid parameters'};
      }
      transaction = trans;
      if (transaction.length === 0) {
        if (fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
        }
        console.log('No transactions found');
        return {success: false, err: 'No transactions found'};
      }

      IterateOver(transaction, waterfall, finished);
    });


    function IterateOver(transaction, iterator, callback) {
      // this is the function that will start all the jobs
      // iterator is a function representing the job when want done on each item
      // callback is the function we want to call when all iterations are over

      var doneCount = 0;  // here we'll keep track of how many transactions have been processed

      function report() {

        doneCount++;
        // if doneCount equals the number of items in list, then we're done
        if (doneCount === transaction.length) {
          callback();
        }
      }

      // here we give each iteration its job
      // for(var i = 0; i < transaction.length; i++) {
      // iterator takes 2 arguments, an item to work on and report function
      iterator(transaction, report, 0);
      // }
    }

    function finished() {
      console.log('All transactions has been processed');
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
      }
      return ({success: true});
    }

    function waterfall(transaction, report, index) {
      var current_transaction = transaction[index];
      // algorithm and password used for the pin decryption
      algorithm = sails.config.connections.cryptoAlgorithm,
        password = sails.config.connections.cryptoPass;

      // pin decryption
      var decipher = crypto.createDecipher(algorithm, password)
      var pin = decipher.update(current_transaction.pin, 'hex', 'utf8')
      pin += decipher.final('utf8');

      async.waterfall([
          function soapInit(callback) {
            // perform soap request
            soap.createClient(sails.config.connections.sourceoffundUrl, function (err, client) {
              if (err) {
                if (fs.existsSync(lockFile)) {
                  fs.unlinkSync(lockFile);
                }
                return callback({msg: "soap_connection_error"});
              }
              console.log('soap init created successfully');
              return callback(null, client);
            });
          },
          function sourceOfFundRequest(client, callback) {
            //populate parameters
            var request = esj.getSourceOfFundRequest(false);
            request.payload.requester.accessValue = current_transaction.from;
            request.payload.requester.password = pin;

            //initiate the getMyEligibleSoF API
            client.getMyEligibleSoF(request, function (err, result, body) {
              if (err) {
                esj.parseTncErrors(body, function (error, errorValue) {
                  return callback({msg: error ? error : errorValue});
                });
              } else {
                return callback(null, body);
              }
            }, {timeout: esj.requestTimeOut})
          },

          // get SOFId
          function parseSOFId(body, callback) {
            async.parallel([
                function (callback1) {
                  esj.parseSOFId(body, function (error, id) {
                    if (error) {
                      return callback1({msg: error});
                    }

                    current_transaction.sofId = id
                    return callback1(null)
                  })
                },
                function (callback2) {
                  esj.parseSOFOwnerId(body, function (error, id) {
                    if (error) {
                      return callback2({msg: error});
                    }

                    current_transaction.sofOwnerId = id
                    return callback2(null)
                  })
                }],
              function (err, results) {
                if (err) {
                  return callback(err);
                }
                return callback(null);
              });
          },

          function soapMerchantInit(callback) {
            soap.createClient(sails.config.connections.merchantPaymentUrl, function (err, client) {
              if (err) {
                return callback({msg: "soap_connection_error"});
              }
              return callback(null, client);
            });
          },

          // get the fees of the transaction
          function getFees(client, callback) {
            //populate parameters
            esj.computeServiceChargeRequest.payload.requester.accessValue = current_transaction.from;
            esj.computeServiceChargeRequest.payload.requester.password = pin;
            esj.computeServiceChargeRequest.payload.amount = current_transaction.amount;
            esj.computeServiceChargeRequest.payload.targetOperationType = 'SALARY_DISBURSEMENT';
            esj.computeServiceChargeRequest.payload.debitedActor.identifier = current_transaction.sofOwnerId;
            esj.computeServiceChargeRequest.payload.debitedSofId = current_transaction.sofId;
            console.log('debited sof before transfer: ' + esj.computeServiceChargeRequest.payload.debitedSofId);

            //initiate the computeServiceCharge API
            client.computeServiceCharge(esj.computeServiceChargeRequest, function (err, result, body) {
              if (err) {
                esj.parseTncErrors(body, function (error, errorValue) {
                  return callback({msg: error ? error : errorValue})
                });
              } else {
                esj.parseFeeValue(body, function (error, fee) {
                  if (error) {
                    return callback({msg: error});
                  }
                  current_transaction.totalFees = parseInt(parseInt(fee) / 100000);
                  current_transaction.total = parseInt(current_transaction.totalFees) + parseInt(current_transaction.amount);
                  return callback(null, client);
                });
              }
            }, {timeout: esj.requestTimeOut});
          },
          function transfer(client, callback) {

            //populate parameters
            esj.salaryTransferRequest.payload.requester.accessValue = current_transaction.from;
            esj.salaryTransferRequest.payload.requester.password = pin;
            esj.salaryTransferRequest.payload.quantity = parseInt(current_transaction.amount.toString() + '00000');
            esj.salaryTransferRequest.payload.employer.identifier = current_transaction.from;
            esj.salaryTransferRequest.payload.employee.identifier = current_transaction.transfer_to;
            esj.salaryTransferRequest.payload.comment = "SALARY_DISBURSEMENT_FROM_CMS";

            //initiate the domesticTransfer API
            client.disburseSalary(esj.salaryTransferRequest, function (err, result, body) {
              if (err) {
                esj.parseTncErrors(body, function (error, errorValue) {
                  return callback({msg: error ? error : errorValue});
                });
              } else {
                esj.parseDisburseSalary(body, function (error, data) {
                  if (error) {
                    return callback(error);
                  }
                  return callback(null, data);
                });
              }
            }, {timeout: esj.requestTimeOut});
          },
          function updateTransaction(data, callback) {
            //update transaction
            current_transaction.status = 'completed';
            current_transaction.operationId = data.operationId;
            current_transaction.newBalance = data.newbalance;
            current_transaction.operationDate = typeof data.operationDate != "undefined" ? new Date(parseInt(data.operationDate)) : new Date();

            try {
              payment.paymentTrigger(current_transaction);
            } catch (error) {
              sails.log.error("DISBURSE_SALARY_FAILED_TO_CALL_PAYMENT_TRIGGER_API", error);
            }

            current_transaction.save(function (err) {
              if (err) {
                return callback({msg: "transaction_completion_error", details: err});
              }
              report();
              var new_index = ++index;
              if (new_index < transaction.length) {
                waterfall(transaction, report, new_index);
              }
            });
          }
        ],
        function (err, result) {
          current_transaction.status = 'Failed';
          current_transaction.comment = err.msg;
          console.log('Failed to perform payment: ' + err.details);
          current_transaction.save(function (err) {
            if (err) {
              console.log('Failed to save transaction' + err.details);
            }
            report();
            var new_index = ++index;
            if (new_index < transaction.length) {
              waterfall(transaction, report, new_index);
            }
          });

        });
    }
  }
}
