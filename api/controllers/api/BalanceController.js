/**
 * ActorController
 *
 * @description :: Server-side logic for managing Transaction
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var soap = require('soap');

module.exports = {

  /**
   * `ActorController.changeLanguage()`
   *
   */
  balance: function (req, res) {
    var params = req.params.all()
    var sofId,sofOwnerId
    if (!params.pin) {
      return res.json(401, {err: 'missing_parameters'});
    }

    async.waterfall([
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
            sails.log.info('Body: ' + JSON.stringify(body));
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
            sails.log.info('Body: ' + JSON.stringify(body));
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
            return res.json({success: 1, balance: balance.slice(0, -5)})
          })
        }],
      function (err, result) {
        sails.log('ESERV ERROR ' + err.msg)
        return res.json({success: 0, err: err.msg});
      })
  }
}

