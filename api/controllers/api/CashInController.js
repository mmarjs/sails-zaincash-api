/**
 * CashInController
 *
 * @description :: Server-side logic for managing CashIn
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
 var soap = require('soap');
 var jwt = require('jsonwebtoken')
 var request = require('request');
 module.exports = {
    denomination: function(req, res) {

        var params = req.params.all();
        if (!params.date) {
            return res.json(401, {err: 'missing_parameters'});
        }

        jwt.sign({
            "date":params.date,
            "iat": Math.floor(Date.now() / 1000) - 30
        }, sails.config.connections.cashinSecretKey, {expiresIn: '15min'}, function (err, token) {
            sails.log.info(token)
            sails.log.info('Error: ' + err);
            var options = {
                url: sails.config.connections.denominationUrl + '/getDenominations.php?token=' + token
            };
            request(options, function (error, response, body) {
                if (error) {
                    return res.json(401, {err: error});
                }
                return res.json(200, {denominations: body});
            });
        });
    },

    preview: function(req, res) {
        var params = req.params.all();
        var transaction, merchantObj
        var currencyConversion = {}
        var requestParams = {}
        var data = {};

        if (!params.pin || !params.denominationCode || !params.lang) {
            return res.json(401, {err: 'missing_or_invalid_parameters'});
        }

        if (params.denominationCode < sails.config.connections.minAmount) {
            return res.json(401, {err: 'invalid_transfer_amount'});
        }

        if (!req.token.phonenumber) {
            return res.json(401, {err: 'user_phonenumber_not_valid'});
        }
        async.waterfall([
            function soapInit(callback) {
                soap.createClient(sails.config.connections.sourceoffundUrl, function (err, client) {
                    if (err) {
                        return callback({msg: "soap_connection_error"})
                    }
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

                        data.sofId = id
                        return callback1(null)
                      })
                    },
                    function (callback2) {
                      esj.parseSOFOwnerId(body, function (error, id) {
                        if (error)
                          return callback2({msg: error})

                        data.sofOwnerId = id
                        return callback2(null)
                      })
                }],
                function (err, results) {
                if (err)
                    return callback(err)
                return callback(null)
                })
            },
            function getCheckoutFields(callback) {
                jwt.sign({
                    'denominationCode': params.denominationCode,
                    'msisdn': req.token.phonenumber,
                    'lang': params.lang,
                    "iat": Math.floor(Date.now() / 1000) - 30
                }, sails.config.connections.cashinSecretKey, {expiresIn: '15min'}, function (err, token) {
                    var options = {
                        url: sails.config.connections.denominationUrl + '/getCheckoutFields.php?token=' + token
                    };
                    request(options, function (error, response, body) {
                        if (error) {
                            return callback({msg: error});
                        }
                        try {
                            body = JSON.parse(body);
                        } catch (e) {
                            return callback({msg: 'no_response_from_zain_cash_please_try_again'});
                        }
                        if (body.status === false) {
                            return callback({msg: body.errorCode});
                        }
                        if (typeof body.amount=="undefined" || typeof body.fees=="undefined" || typeof body.total=="undefined" || typeof body.deductFrom=="undefined" || typeof body.remainingMonthlyLimit=="undefined") {
                            return callback({msg: 'invalid_data'})
                        }
                        return callback(null, body)
                    });
                });
            },
            function saveNewTransaction(body, callback) {
                //get authorization from the header
                parts = req.headers.authorization.split(' ');
                token = parts[1];

                data = {
                    token: token,
                    source: 'mobile',
                    type: 'MERCHANT_PAYMENT',
                    amount: body.amount,
                    totalFees: body.fees,
                    from: body.deductFrom,
                    serviceType: 'CASHIN',
                    status: 'pending_confirmation',
                    denominationCode: params.denominationCode
                };

                Transactions.create(data).exec(function createCB(err, obj) {
                    if (err) {
                      return callback({msg: "transaction_completion_error", details: err.details});
                    }

                    transaction = obj
                    return res.json({
                        success: 1,
                        amount: data.amount,
                        fees: data.totalFees,
                        total: data.amount - data.totalFees,
                        deductFrom: body.deductFrom,
                        remainingMonthlyLimit: body.remainingMonthlyLimit,
                        transactionId: transaction.id
                    });
                });
            }
        ],
        function (err, result) {
            sails.log('ESERV ERROR ' + err.msg)
            return res.json({success: 0, err: err.msg});
        })
    },

    confirm: function(req, res) {
        var params = req.params.all()
        var transactionId = params.transactionId;
        var pin = params.pin;
        var transaction

        if (!req.token.phonenumber) {
            return res.json(401, {err: 'user_phonenumber_not_valid'});
        }

        if (!transactionId || !pin) {
          return res.json(401, {err: 'missing_or_invalid_parameters'});
        }

        async.waterfall([
            function validateTransaction(callback) {
              Transactions.findOne({id: transactionId}).populate("to").exec(function (err, trans) {
                if (err || !trans)
                  return callback({msg: "invalid_transaction_id"})

                // if (!trans.to.msisdn)
                //   return callback({msg: "unknown_zain_cash_receiver"})

                if (!trans.amount || parseInt(trans.amount) < sails.config.connections.minAmount)
                  return callback({msg: "invalid_transfer_amount"})

                if (trans.status !== "pending_confirmation")
                  return callback({msg: "transaction_is_already_completed"})

                transaction = trans
                callback(null)
              })
            },
            function  performCashin(callback) {
                jwt.sign({
                    'denominationCode': transaction.denominationCode,
                    'msisdn': transaction.from,
                    'lang': params.lang,
                    'pin': params.pin,
                    'deviceId': params.deviceId,
                    'userId': params.userId,
                    'iat': Math.floor(Date.now() / 1000) - 30
                }, sails.config.connections.cashinSecretKey, {expiresIn: '15min'}, function (err, token) {
                    var options = {
                        url: sails.config.connections.denominationUrl + '/performCashin.php?token=' + token
                    };
                    request(options, function (error, response, body) {
                        sails.log.info("request error: " + JSON.stringify(error));
                        sails.log.info("request error: " + JSON.stringify(body));
                        sails.log.info("request error: " + JSON.stringify(response));
                        if (error) {
                            return callback({msg: error});
                        }
                        try {
                            body = JSON.parse(body);
                        } catch (e) {
                            return callback({msg: 'no_response_from_zain_cash_please_try_again'});
                        }
                        if (body.status === false) {
                            return callback({msg: body.errorCode});
                        }
                        if (typeof body.operationId=="undefined" || typeof body.amount=="undefined" || typeof body.fees=="undefined" || typeof body.total=="undefined" || typeof body.deductFrom=="undefined" || typeof body.remainingMonthlyLimit=="undefined") {
                            return callback({msg: 'invalid_data'})
                        }

                        return callback(null, body)
                    });
                });
            },
            function updateTransaction(body, callback) {
                //update transaction
                transaction.status = 'completed';
                transaction.operationId = body.operationId;

                transaction.save(function (err) {
                    if (err)
                        return callback({msg: 'transaction_completion_error', details: err});

                    return res.json({
                        success: 1,
                        amount: body.amount,
                        fees: body.fees,
                        total: body.total,
                        remainingMonthlyLimit: body.remainingMonthlyLimit,
                        deductFrom: body.deductFrom
                    });
                });
            },
        ],
        function (err, result) {
            sails.log('ESERV ERROR ' + err.msg)
            return res.json({success: 0, err: err.msg})
        })
    }
}
