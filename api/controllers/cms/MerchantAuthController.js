/**
 * MerchantController
 *
 * @description :: Server-side logic for Merchants authentication
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var jwt = require('jsonwebtoken'),
  soap = require('soap');

module.exports = {

  /**
   * `MerchantAuthController.authenticate()`
   *
   * Authenticate Merchant by checking their msidsn number
   */
  authenticate: function (req, res) {
    var phonenumber = req.param('phonenumber');
    var pin = req.param('pin');
    var merchant

    if (!phonenumber || !pin) {
      return res.json(401, {err: 'phonenumber and Pin are required'});
    }

    async.waterfall([
        function findMerchant(callback) {
          var filter = {msisdn: phonenumber,deleted:false};

          Merchants.findOne(filter, function (err, merch) {
            if (err || !merch)
              return callback({msg: "no_merhant_found"})

            merchant = merch
            callback(null)
          })
        },
        function ValideEserv(doneCallback) {
          async.parallel([
              function (callback) {
                soap.createClient(sails.config.connections.securityUrl, function (err, client) {
		 sails.log.info('security URL: ' + sails.config.connections.securityUrl);
                  if (err)
                    return callback({msg: "soap_connection_error"})

                  esj.loginRequest.payload.requester.accessValue = phonenumber
                  esj.loginRequest.payload.requester.password = pin
                  esj.loginRequest.payload.sessionIdSeed = esj.merchantSessionId(merchant)

		  sails.log.info('Login Request: ' + JSON.stringify(esj.loginRequest));
                  //Set Security not empty as login doesn't require any security in the header
                  client.security = ""
                  sails.log.info('initiate the login API');
                  sails.log.info(JSON.stringify(esj.loginRequest));
                  client.login(esj.loginRequest, function (err, result, body) {
                    sails.log.info("Body: " + JSON.stringify(body));
                    if (err)
                      esj.parseInpErrors(body, function (error, errorValue) {
                        return callback({msg: error ? error : errorValue})
                      })
                    else
                      esj.parseSessionId(body, function (error, sessionId) {
                        if (error)
                          return callback({msg: error})

                        return callback(null)
                      })
                  }, {timeout: esj.requestTimeOut})
                })
              },
              function (callback) {
                soap.createClient(sails.config.connections.sourceoffundUrl, function (err, client) {
                  if (err)
                    return callback({msg: "soap_connection_error"})

                  var request = esj.getSourceOfFundRequest(false)
                  request.payload.requester.accessValue = phonenumber
                  request.payload.requester.password = pin

                  //initiate the getMyEligibleSoF API
                  sails.log.info('initiate the getMyEligibleSoF API');
                  sails.log.info(JSON.stringify(request));
                  client.getMyEligibleSoF(request, function (err, result, body) {
                    sails.log.info("Body: " + JSON.stringify(body));
                    if (err)
                      esj.parseTncErrors(body, function (error, errorValue) {
                        return callback({msg: error ? error : errorValue})
                      })
                    else
                      esj.parseSOFId(body, function (error, id) {
                        if (error)
                          return callback({msg: error})

                        merchant.sofId = id
                        return callback(null)
                      })
                  }, {timeout: esj.requestTimeOut})
                })
              }
            ],
            function (err, results) {
              if (err)
                return doneCallback(err)

              return doneCallback(null)
            });
        },
        function updateMerchant(sofId, callback) {
          merchant.save(function (err) {
            if (err)
              return callback({msg: "unknown_merchant"})
            else
              res.json({
                id: merchant.id,
                sof_id: merchant.sofId,
                name: merchant.name,
                token: jwToken.issue({merchantId: merchant.id})
              });
          })
        }
      ],
      function (err) {
        if (err) {
          err.msg = err.msg != undefined ? err.msg : "unknown_error"
          return res.json(401, {err: err.msg});
        }
        return res.serverError()
      }
    )
  }

}

