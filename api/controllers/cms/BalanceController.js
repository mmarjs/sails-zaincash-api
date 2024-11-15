/**
 * BalanceController
 *
 * @description :: Server-side logic for Merchants authentication
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var soap = require('soap');//Soap Library and XML parser

module.exports = {

  /**
   * `BalanceController.get()`
   *
   * Pull Phone balance from Eserv
   */
  get: function (req, res) {
    var soapClient, merchant

    async.waterfall([
        function validateMerchant(callback) {
          Merchants.findOne({id: req.token.merchantId,deleted:false}, function (err, merch) {
            if (err || !merch)
              return callback({msg: "invalid_merchant"})

            merchant = merch
            callback(null)
          })
        },
        function soapInit(callback) {
          soap.createClient(sails.config.connections.sourceoffundUrl, function (err, client) {
            if (err)
              return callback({msg: "soap_connection_error"})

            soapClient = client
            callback(null)
          })
        },
        function getMySoFBalanceRequest(callback) {
          //populate parameters
          var request = esj.getMySoFBalanceRequest(true)
          request.payload.requester.accessValue = merchant.msisdn
          request.payload.requester.externalSessionId = esj.merchantSessionId(merchant)
          request.payload.sofId = merchant.sofId
	  sails.log.info('Data to be sent to get merchant balance: ' + JSON.stringify(request.payload));
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
            return res.json({success: 1, balance: balance.slice(0, -5)})
          })
        }],
      function (err, result) {
        return res.json({success: 0, err: err.msg});
      })
  }
}

