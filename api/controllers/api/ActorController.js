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
  changeLanguage: function (req, res) {
    var params = req.params.all()
    var pin = params.pin
    var lang = params.lang
    var languages = {
      "ar": "ar-KW",
      "en": "en-GB",
      "ku": "ku-IQ"
    };

    if (!languages[lang])
      return res.json({success: 0, err: "invalid_language"})

    soap.createClient(sails.config.connections.actorUrl, function (err, client) {
      if (err)
        return res.json({success: 0, err: "soap_connection_error"})

      //populate parameters
      esj.actorSelfChangeLanguage.payload.requester.accessValue = req.token.phonenumber
      esj.actorSelfChangeLanguage.payload.requester.password = pin.toString()
      esj.actorSelfChangeLanguage.payload.language = languages[lang].toString()

      //initiate the domesticTransfer API
      sails.log.info('initiate domesticTransfer API');
      sails.log.info(JSON.stringify(esj.actorSelfChangeLanguage));
      client.actorSelfChangeLanguage(esj.actorSelfChangeLanguage, function (err, result, body) {
        sails.log.info('Body: ' + JSON.stringify(body));
        if (err)
          esj.parseTncErrors(body, function (error, errorValue) {
            return res.json({success: 0, err: error ? error : errorValue})
          })
        else
          return res.json({success: 1})
      })
    })
  },
  /**
   * `ActorController.changePin()`
   *
   */
  changePin: function (req, res) {
    var params = req.params.all()
    var phonenumber = params.phone
    var pin = params.pin
    var newPin = params.new_pin

    if (phonenumber !== req.token.phonenumber)
      return res.json({success: 0, err: "validation_error"});
     async.waterfall([
      function changeSelfPin(callback){
        soap.createClient(sails.config.connections.actorUrl, function (err, client) {
          if (err)
            return callback({msg: "soap_connection_error"})

          //populate parameters
          esj.actorSelfPinChange.payload.requester.accessValue = req.token.phonenumber
          esj.actorSelfPinChange.payload.requester.password = pin.toString()
          esj.actorSelfPinChange.payload.pinCode = newPin

          //initiate the domesticTransfer API
          sails.log.info('initiate domesticTransfer API');
          sails.log.info(JSON.stringify(esj.actorSelfPinChange));
          client.actorSelfPinChange(esj.actorSelfPinChange, function (err, result, body) {
            sails.log.info('Body: ' + JSON.stringify(body));
            if (err)
              esj.parseTncErrors(body, function (error, errorValue) {
                sails.log('ESERV ERROR ' + error);
                return res.json({success: 0, err: error ? error : errorValue})
              })
            else
              return callback(null);
          }, {timeout: esj.requestTimeOut})
        })
      },
      function getSOFId(callback) {
        soap.createClient(sails.config.connections.sourceoffundUrl, function (err, client) {
          if (err)
            return callback({msg: "soap_connection_error"})

          sails.log.info("eserv error on create soap : " + newPin)
          var request = esj.getSourceOfFundRequest(false)
          request.payload.requester.accessValue = phonenumber
          request.payload.requester.password = newPin

          //initiate the getMyEligibleSoF API
          sails.log.info('initiate the getMyEligibleSoF API');
          sails.log.info(JSON.stringify(request));
          client.getMyEligibleSoF(request, function (err, result, body) {
            sails.log.info('Body: ' + JSON.stringify(body));
            if (err)
              esj.parseTncErrors(body, function (error, errorValue) {
                return callback({msg: error ? error : errorValue})
              })
            else
              esj.parseSOFId(body, function (error, id) {
                if (error)
                  return callback({msg: error})

                res.json({success:1,sofId: id, token: jwToken.issue({phonenumber: phonenumber, sofId: id})});
                // return callback({success:1,sofId: id, token: jwToken.issue({phonenumber: phonenumber, sofId: id})});
              })
          }, {timeout: esj.requestTimeOut})
        })
      }
      ],
      function (err, results) {
        if (err) {
          sails.log.info("error " + err.toString())
          err.msg = err.msg != undefined ? err.msg : "unknown_error"
          return res.json(401, {err: err.msg});
        }
        return res.serverError()
      });
  },

  validateLastTransaction: function(req, res) {
    var params = req.params.all();
    if (!params.lastTransactionType) {
      return res.json({success: 0, err: 'validation_error'});
    }

    if (!req.token.phonenumber) {
      return res.json(401, {err: 'user_phonenumber_not_valid'});
    }

    var lastTransaction = params.lastTransactionType;
    var phonenumber = req.token.phonenumber;

    var filter = {
      or: [
        {transfer_to: phonenumber},
        {from: phonenumber}
      ],
      status: 'completed'
    };

    // Find only the last transaction related to the user
    Transactions.findOne(filter).sort({operationDate: 'DESC'}).limit(1).exec(function (err, transaction){
        if (err) return res.json({success: 0, err: "error_fetching_transactions"});

        if (!transaction) return res.json({success: 0, err: "reset_password_no_transaction_found"});

        sails.log.info('Transaction: ' + transaction.serviceType);

        if (lastTransaction === 'EGOODS' && (transaction.serviceType === 'MintRoute' || transaction.serviceType === 'ONECARD')) {
            return res.json({success: 1});
        }
        // check if the last trasnaction conducted by the user is from the web
        // or whether the received trasnaction matches the last transaction
        // conducted by the user
        if ( (lastTransaction === 'web' && transaction.source !== 'web')
          || (lastTransaction !== transaction.serviceType)
        ) return res.json({success: 0, err: 'reset_password_invalid_transaction_type'});

        return res.json({success: 1});

    });

  }
}

