/**
 * Created by yjradeh on 8/11/16.
 */
var soap = require('soap');//Soap Library and XML parser
var moment = require('moment');

module.exports = {
  run: function () {

    //add new log
    sails.log('defaultNumberLogin Started at ' + new Date());
    soap.createClient(sails.config.connections.securityUrl, function (err, client) {
      if (err)
        sails.log('defaultNumberLogin cron error soap_connection_error');

      esj.loginRequest.payload.requester.accessValue = sails.config.connections.defaultNumber
      esj.loginRequest.payload.requester.password = sails.config.connections.defaultPin
      esj.loginRequest.payload.sessionIdSeed = esj.defaultNumberSessionId()

      //Set Security not empty as login doesn't require any security in the header
      client.security = ""
      client.login(esj.loginRequest, function (err, result, body) {
        if (err)
          esj.parseInpErrors(body, function (error, errorValue) {
            sails.log('defaultNumberLogin cron error ' + new Date());
            sails.log('defaultNumberLogin error ' + error ? error : errorValue);
          })
        else
          esj.parseSessionId(body, function (error, sessionId) {
            sails.log('defaultNumberLogin cron done ' + new Date());

            if (error)
              return {success: false, err: error}

            return {success: true}
          })
      })
    })
  },
}
