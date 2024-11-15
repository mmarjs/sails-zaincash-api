/* @description :: Server-side logic for Cash Disbursement
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var soap = require('soap');
var crypto = require('crypto');
var failedTransactions = {};

module.exports = {

 /**
  * Save all pending transactions
  */
  savePendingTransactions: function (req, res) {

        var params = req.params.all();
        var data = [];
        var new_pin;

        if (!params.list_items || !params.from || !params.pin) {
            return res.json(401, {err: 'Missing parameters'});
        }

        var list_items = JSON.parse(params.list_items);
         //get authorization from the header
         parts = req.headers.authorization.split(' ');
         token = parts[1];

         // algorithm and password used for the pin encryption
         algorithm = sails.config.connections.cryptoAlgorithm,
         password = sails.config.connections.cryptoPass;

         // Nodejs encryption with CTR
         var cipher = crypto.createCipher(algorithm,password)
         new_pin = cipher.update(params.pin,'utf8','hex')
         new_pin += cipher.final('hex');

        // data to be saved in the database
        for (var i=0; i<list_items.length; i++) {
            if (!list_items[i].amount || !list_items[i].employee_msisdn || !list_items[i].merchant_list_id || !list_items[i].employee_name) {
                return res.json(401, {err: 'Missing parameters'});
            }

            if (list_items[i].amount < sails.config.connections.minAmount) {
                return res.json(401, {err: 'invalid_transfer_amount'});
            }

            data.push({
                token: token,
                from: params.from,
                source: 'cms',
                type: 'MONEY_TRANSFER',
                amount: parseInt(list_items[i].amount),
                transfer_to: list_items[i].employee_msisdn,
                serviceType: 'CASH_DISBURSEMENT',
                status: 'pending',
                listId: parseInt(list_items[i].merchant_list_id),
                pin: new_pin,
                employee_name: list_items[i].employee_name,
                comment: 'SALARY DISBURSEMENT FROM CMS'
            });
        }

        // create new transaction record in the database
        Transactions.create(data).exec(function createCB(err, transaction) {
            if (err) {
              return res.json(401, {err: 'missing_or_invalid_parameters', details: err.details});
            }
            return res.json({
                success: 1
            });
        });

    },

    // checks if there are pending transactions in the list
    checkForPendingTransactions: function(req, res) {
        var params = req.params.all();

        if (!params.list_id) {
            return res.json(401, {err: 'Missing parameters'});
        }

        Transactions.findOne({
            serviceType: 'CASH_DISBURSEMENT',
            status: 'pending',
            listId: parseInt(params.list_id)
          }).exec(function (err, transaction) {
            if (err) {
                return res.json(401, {err: 'missing_or_invalid_parametres', details: err.details});
            }

            // pending transaction found
            if (transaction) {
                return res.json({
                    success: 1,
                    pending: 1
                });
            }

            return res.json({
                success: 1,
                pending: 0
            });
        });
    },

    getListHistory: function(req, res) {

        var params = req.params.all();

        if (!params.list_id || !params.per_page || !params.page) {
            return res.json(401, {err: 'Missing parameters'});
        }
        var transaction_count, completed_count, failed_count, pending_count;
        var search = createSearchObject();
        async.waterfall([
            function countTransactions(callback) {
                async.parallel([
                    // get the count of all the transactions
                    function (callback1) {
                        Transactions.count(search).exec(function(err, count) {
                            if (err) {
                                return callback1({msg: err.details});
                            }
                            transaction_count = count;
                            return callback1(null);
                        });
                    },
                    // get the count of the completed transactions
                    function (callback2) {
                        var newSearch = search;
                        newSearch.status = 'completed';
                        Transactions.count(search).exec(function(err, count) {
                            if (err) {
                                return callback2({msg: err.details});
                            }
                            completed_count = count;
                            return callback2(null);
                        });
                    },
                    // get the count of the failed transactions
                    function (callback3) {
                        var newSearch = search;
                        newSearch.status = 'Failed';
                        Transactions.count(search).exec(function(err, count) {
                            if (err) {
                                return callback3({msg: err.details});
                            }
                            failed_count = count;
                            return callback3(null);
                        });
                    },
                     // get the count of the pending transactions
                     function (callback4) {
                        var newSearch = search;
                        newSearch.status = 'pending';
                        Transactions.count(search).exec(function(err, count) {
                            if (err) {
                                return callback4({msg: err.details});
                            }
                            pending_count = count;
                            return callback4(null);
                        });
                    },
                ],
                    function (err, results) {
                        if (err) {
                            return callback(err);
                        }
                        return callback(null);
                    }
                );
            },
             // get list transactions history
            function getTransactions(callback) {
                // search filter based on transaction status
                if (params.status) {
                    search.status = params.status;
                }else{
                    delete search.status;
                }
                Transactions.find({
                    'where': search,
                    'sort': 'createdAt DESC',
                    'select': [
                        'transfer_to', 'employee_name', 'amount',
                        'status', 'createdAt', 'updatedAt',
                        'comment', 'totalFees', 'total'
                    ]
                }).paginate({
                    page: parseInt(params.page),
                    limit: parseInt(params.per_page)
                }).exec(function(err, trans) {
                    if (err) {
                        return callback({msg: err.details});
                    }
                    return callback(null, trans)
                });
            },
             // return list history data
            function returnTransactions(transaction, callback) {

                var current_page = typeof params.page == 'number' ? params.page : 1;
                var last_page = Math.ceil (transaction_count / (params.per_page > 0 ? params.per_page : 1));

                return res.json({
                    success: 1,
                    transactions: {
                        transaction:transaction,
                        total: transaction_count,
                        current_page: current_page,
                        last_page: last_page,
                        has_more: current_page < last_page,
                        completed_count: completed_count,
                        failed_count: failed_count,
                        pending_count: pending_count
                    }
                });
            }
        ],
        function (err, result) {
            return res.json({
                success: 0,
                err: err.msg
            });
        });


        // build the search object based on the specfied filters
        function createSearchObject() {
            var search = {};

            search.serviceType = 'CASH_DISBURSEMENT';
            search.listId = parseInt(params.list_id);

            // search filters based on date
            if (params.from && params.to){
                var date_to = new Date(params.to);
                date_to.setHours(23);
                date_to.setMinutes(59);
                date_to.setSeconds(59);
                search.$and=[
                          {createdAt:{'>=' : params.from}},
                          {createdAt:{'<=' : date_to}}
                ];
            }else{
                if (params.from) {
                    search.createdAt = {'>=' : params.from};
                }

                if (params.to) {
                    var date_to = new Date(params.to);
                    date_to.setHours(23);
                    date_to.setMinutes(59);
                    date_to.setSeconds(59);
                    search.createdAt = {'<=' : date_to};
                }
            }

            // search filter based on employee msisdn
            if (params.msisdn) {
                search.transfer_to = {contains: params.msisdn};
            }

            // search filter based on employee name
            if (params.name) {
                search.employee_name = {contains: params.name};
            }


            return search;
        }
    },

    performFailedTransaction: function(req, res) {
        var params = req.params.all();

        if (!params.transaction_id || !params.merchant_msisdn) {
            return res.json(401, {err: 'Missing parameters'});
        }
        var transaction_id = params.transaction_id;

        if (failedTransactions[transaction_id]) {
            return res.json(401, {err: 'Transaction is being processed'});
        }
        failedTransactions[transaction_id] = true;

        checkIfTransactionExists();
        // check if list exists and that it belongs to the merchant
        function checkIfTransactionExists() {
            Transactions.findOne({
                id: transaction_id,
                from: params.merchant_msisdn,
                status: 'Failed'
            }).exec(function(err, trans) {
                if (err) {
                    // remove proprety from the object
                    delete failedTransactions[transaction_id];
                    return res.json(401, {err: err.details});
                }

                if (typeof trans == 'undefined') {
                    delete failedTransactions[transaction_id];
                    return res.json(401, {err: 'transaction_not_foud'});
                }
                performTransaction(trans);
            })
        }

        function performTransaction(transaction) {
            // algorithm and password used for the pin decryption
            algorithm = sails.config.connections.cryptoAlgorithm,
            password = sails.config.connections.cryptoPass;

            // pin decryption
            var decipher = crypto.createDecipher(algorithm,password)
            var pin = decipher.update(transaction.pin,'hex','utf8')
            pin += decipher.final('utf8');

            async.waterfall([
                function soapInit(callback) {
                    // perform soap request
                    soap.createClient(sails.config.connections.sourceoffundUrl, function (err, client) {
                        if (err) {
                        return callback({msg: "soap_connection_error"});
                        }
                        return callback(null, client);
                    });
                },

                function sourceOfFundRequest(client, callback) {
                    //populate parameters
                    var request = esj.getSourceOfFundRequest(false);
                    request.payload.requester.accessValue = transaction.from;
                    request.payload.requester.password = pin;
                    //initiate the getMyEligibleSoF API
                  sails.log.info('initiate the getMyEligibleSoF API');
                  sails.log.info(JSON.stringify(request));
                    client.getMyEligibleSoF(request, function (err, result, body) {
                      sails.log.info("Body: " + JSON.stringify(body));
                        if (err) {
                            esj.parseTncErrors(body, function (error, errorValue) {
                                return callback({msg: error ? error : errorValue});
                            });
                        }
                        else {
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

                            transaction.sofId = id
                            return callback1(null)
                            })
                        },
                        function (callback2) {
                            esj.parseSOFOwnerId(body, function (error, id) {
                            if (error) {
                                return callback2({msg: error});
                            }

                            transaction.sofOwnerId = id
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
                    esj.computeServiceChargeRequest.payload.requester.accessValue = transaction.from;
                    esj.computeServiceChargeRequest.payload.requester.password =  pin;
                    esj.computeServiceChargeRequest.payload.amount = parseInt(transaction.amount);
                    esj.computeServiceChargeRequest.payload.targetOperationType = 'SALARY_DISBURSEMENT';
                    esj.computeServiceChargeRequest.payload.debitedActor.identifier = transaction.sofOwnerId;
                    esj.computeServiceChargeRequest.payload.debitedSofId = transaction.sofId;

                    //initiate the computeServiceCharge API
                  sails.log.info('initiate the computeServiceCharge API');
                  sails.log.info(JSON.stringify(esj.computeServiceChargeRequest));
                    client.computeServiceCharge(esj.computeServiceChargeRequest, function (err, result, body) {
                        sails.log.info("Body: " + JSON.stringify(body));
                        if (err) {
                            esj.parseTncErrors(body, function (error, errorValue) {
                            return callback({msg: error ? error : errorValue})
                            });
                        }
                        else {
                            esj.parseFeeValue(body, function (error, fee) {
                                if (error) {
                                    return callback({msg: error});
                                }
                                transaction.totalFees = parseInt(parseInt(fee) / 100000);
                                transaction.total = parseInt(transaction.totalFees) + parseInt(transaction.amount);
                                return callback(null, client);
                            });
                        }
                    }, {timeout: esj.requestTimeOut});
                },
                function transfer(client, callback) {
                 //populate parameters
                 esj.salaryTransferRequest.payload.requester.accessValue = transaction.from;
                 esj.salaryTransferRequest.payload.requester.password = pin;
                 esj.salaryTransferRequest.payload.quantity = parseInt(transaction.amount.toString() + '00000');
                 esj.salaryTransferRequest.payload.employer.identifier = transaction.from;
                 esj.salaryTransferRequest.payload.employee.identifier = transaction.transfer_to;
                 esj.salaryTransferRequest.payload.comment = "SALARY_TRANSFER_FROM_CMS";

                    //initiate the domesticTransfer API
                  sails.log.info('initiate the domesticTransfer API');
                  sails.log.info(JSON.stringify(esj.salaryTransferRequest));
                    client.disburseSalary(esj.salaryTransferRequest, function (err, result, body) {
                      sails.log.info("Body: " + JSON.stringify(body));
                        if (err) {
                            esj.parseTncErrors(body, function (error, errorValue) {
                                return callback({msg: error ? error : errorValue});
                            });
                        }
                        else {
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
                    transaction.status = 'completed';
                    transaction.operationId = data.operationId.toString();
                    transaction.newBalance = data.newbalance;

                    transaction.save(function (err) {
                        if (err) {
                            return callback({msg: "transaction_completion_error", details: err});
                        }
                        // remove proprety from the object
                        delete failedTransactions[transaction_id];
                        return res.json({
                            success: 1,
                            status: 'completed'
                        });
                    });
                }
            ],
            function (err, result) {
                transaction.status = 'Failed';
                transaction.failed_message = err.msg;
                // remove proprety from the object
                delete failedTransactions[transaction_id];
                transaction.save(function (err) {
                    if (err) {
                        console.log('Failed to save transaction');
                    }
                });
                return res.json({
                    success: 0,
                    err: err.msg
                });
            });
        }
    }
}
