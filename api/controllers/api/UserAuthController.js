/**
 * UserAuthController
 *
 * @description :: Server-side logic for Merchants authentication
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var jwt = require('jsonwebtoken'),
  soap = require('soap'),
  math = require('mathjs'),//Soap Library and XML parser
  smpp = require('smpp');

module.exports = {

  /**
   * `MerchantAuthController.authenticate()`
   *
   * Authenticate Merchant by checking their msidsn number and password added to mongoDB collection
   */
  authenticate: function (req, res) {
    var phonenumber = req.param('phone')
    var pin = req.param('pin')
    var sofId
    var os = req.param('os');
    var profileCodes = req.param('profile_codes');

    if (!phonenumber || !pin) {
      return res.json(401, {err: 'Phone and Pin are required'});
    }

    profileCodes = profileCodes.split(",");

    async.waterfall([
        function ValideEserv(callback) {
          sails.log.info("eserv login : " + phonenumber);
          soap.createClient(sails.config.connections.sourceoffundUrl, function (err, client) {
            if (err) {
              sails.log.info("eserv error on create soap : " + phonenumber)
              return callback({msg: "soap_connection_error"})
            }

            sails.log.info("[normal login] inside validate Login : " + phonenumber + " pin ****");
            var request = esj.getSourceOfFundRequest(false)
            request.payload.requester.accessValue = phonenumber.toString();
            request.payload.requester.password = pin.toString();

            //initiate the getMyEligibleSoF API
            client.getMyEligibleSoF(request, function (err, result, body) {
              console.log("request ", request); //printed it out
              console.log("----request ---" +  request); //obje
              sails.log.info("printing the request  " + request); //obj
              sails.log.info("printing the body of the returned soap" + body);
              if (err)
                esj.parseTncErrors(body, function (error, errorValue) {
                  sails.log.info("printing the body in parse Tnc errors " + body);
                  sails.log.info("eserv login : getMyEligibleSoF error : " + error + " ,value : " + errorValue)
                  return callback({msg: error ? error : errorValue})
                })
              else
                esj.parseSOFId(body, function (error, id) {
                  sails.log.info("inside parseSOFId" + id);
                  if (error) {
                    sails.log.info("eserv login : error in response : " + error)
                    return callback({msg: error});
                  }

                  sofId = id
                  sails.log.info("sofId " + id);
                  return callback(null)
                })
            }, {timeout: esj.requestTimeOut})
          })
        },
        function findPeer(callback){
          soap.createClient(sails.config.connections.actorUrl, function (err, client) {
            if (err) {
              sails.log.info("eserv error on create soap : " + phonenumber)
              return callback({msg: "soap_connection_error"})
            }

            var request = esj.findPeerRequest;
            request.payload.requester.accessValue = phonenumber.toString();
            request.payload.requester.password = pin.toString();
            request.payload.actorIdentifier = phonenumber.toString();
            //find peer API
            client.findPeer(request, function (err, result, body) {
              if (err){
                  console.log("login find peer  ",err);
                  return callback({msg: 'invalid_login_error'});
                }
              else
                esj.parseActorId(body, function (error, id) {
                  if (error) {
                    sails.log.info("eserv login : error in response : " + error)
                    return callback({msg: error});
                  }

                  sails.log.info("actorId " + id);
                  return callback(null,id)
                })
            }, {timeout: esj.requestTimeOut})
          })
        },
        function getActorDetails(id,callback){
          soap.createClient(sails.config.connections.actorUrl, function (err, client) {
            if (err) {
              return callback({msg: "soap_connection_error"})
            }

            var request = esj.getActorDetailsRequest
            request.payload.requester.accessValue = phonenumber.toString();
            request.payload.requester.password = pin.toString();
            request.payload.actorId = id;

            //initiate the getMyEligibleSoF API
            client.actorGetDetails(request, function (err, result, body) {
              if (err){
                  console.log("error actor details ",err);
                  return callback({msg: 'invalid_login_error'});
                }
              else
                esj.parseProfileCode(body, function (error, profileCode) {
                  if (error) {
                    sails.log.info("eserv login : error in response : " + error)
                    return callback({msg: error});
                  }
                  if (profileCodes.indexOf(profileCode)!=-1){
                      return callback(null,profileCode)
                    }else{
                      return callback({msg: 'invalid_profile_code'});
                    }

                })
            }, {timeout: esj.requestTimeOut})
          })
        },
        function sendOtp(profileCode,callback) {
        try {
	// var queue = require('bulkhead-kue');
          // try {
          var otp = math.randomInt(1000, 9999)
          sails.log.info(sails.config.connections.UAT);
          sails.log.info(sails.config.connections.UAT == true);
          if(sails.config.connections.UAT == true){
            otp = 1111;
          }
          // queue.create('SMPP', 'Send SMS', {name: 'sms'}, function (results, job) {
          //   sails.log.info("Inside Send Otp ");
          //   var session = smpp.connect(sails.config.connections.smsGateway);
          //   console.log("session ", session);
          //   sails.log.info("sms gate aways  " + sails.config.connections.smsGateway);
          //   sails.log.info("session " + session.toString());
          //   console.log("session  --" + session);
          //   session.bind_transceiver({
          //     system_id: sails.config.connections.username,
          //     password: sails.config.connections.password,
          //     system_type: 'SMPP',
          //     interface_version: 52
          //   }, function (pdu) {
          //     sails.log.info("before establishing session")
          //     for (var k in smpp.errors) {
          //       if (smpp.errors[k] == pdu.command_status) {
          //         sails.log.info("smpp Error " + k);
          //       }
          //     }
          //     if (pdu.command_status == 0) {
                // sails.log.info("smsc : established session")
                var shortMessage = "Your One-Time Password is : " + otp.toString() +" Dont share the Pin Code with anyone";;
                if (os && os=="android"){
                  shortMessage="<#> "+shortMessage+"\n"+sails.config.connections.androidSMSKey;
                }
                sms.send(shortMessage,phonenumber.toString());
                // Successfully bound
          //       session.submit_sm({
          //         source_addr_ton: 5,
          //         source_addr_npi: 0,
          //         dest_addr_ton: 1,
          //         dest_addr_npi: 1,
          //         source_addr: "ZainCash",
          //         destination_addr: phonenumber.toString(),
          //         short_message: shortMessage
          //       }, function (pdu) {
          //         if (pdu.command_status == 0) {
			       //          var datetime = new Date();
          //             sails.log.info("smsc : sms sent to " + phonenumber.toString() + " at " + datetime.toISOString() + " with message id " +  pdu.message_id)
          //           // Message successfully sent
          //           // res.json({sofId: sofId, otp: otp, token: jwToken.issue({phonenumber: phonenumber, sofId: sofId})});
          //         }
          //         else {
          //           sails.log.info("smsc : error sending sms")
          //           return callback({msg: "sending_otp_error"})
          //         }
          //       });
          //     }
          //     else {
          //       sails.log.info("smsc : error in session");
          //       return callback({msg: "sending_otp_error"})
          //     }
          //   });
          // }, function (err, results) {
          //   // Callback that is fired when the job is saved into the queue
          //   console.log(results.response().name) // Outputs 'sms'
          // });

          // queue.process('SMPP', 'Send SMS', null, function (job, next) {
          //   job.attempts(3);
          //   // Callback that is fired per job being processed
          //   console.log(job.data.name); // Outputs 'sms'
          //   next(undefined, job.data); // Moves on to the next job to process
          // });
          res.json({profileCode:profileCode,sofId: sofId, otp: otp, token: jwToken.issue({phonenumber: phonenumber, sofId: sofId})});
       	  } catch (e) {
            sail.log.error('SMS Error', e);
          }
	 }
      ],
      function (err) {
        if (err) {
          err.msg = err.msg != undefined ? err.msg : "unknown_error"
          sails.log('ESERV ERROR ' + err.msg)
          return res.json(401, {err: err.msg});
        }
        return res.serverError()
      }
    )
  },

  //actor login to check if the user need to change their temp pin
  actorLogin: function (req, res) {
    var phonenumber = req.param('phone');
    var pin = req.param('pin');
    var user = {};
    var os = req.param('os');
    var profileCodes = req.param('profile_codes');

    if (!phonenumber || !pin) {
      return res.json(401, {err: 'Phone and Pin are required'});
    }

    profileCodes = profileCodes.split(",");
    sails.log.info("actor login : " + phonenumber);
    async.waterfall([
        function validateLogin(callback) {
          soap.createClient(sails.config.connections.securityUrl, function (err, client) {
            if (err)
              return callback({msg: "soap_connection_error"})


            sails.log.info("[actor login] inside validate Login(login request) : " + phonenumber + " pin ****");
            esj.loginRequest.payload.requester.accessValue = phonenumber
            esj.loginRequest.payload.requester.password = pin
            esj.loginRequest.payload.sessionIdSeed = esj.customerSessionId(phonenumber)

            sails.log.info("request before soap call ", JSON.stringify(esj.loginRequest, null, 4));
            //Set Security not empty as login doesn't require any security in the header
            client.security = ""
            client.login(esj.loginRequest, function (err, result, body) {
              sails.log.info("printing the body  " + body);
              sails.log.info("Calling login request (security url) in actor login ");
              if (err) {
                sails.log.info("error  " + err);
                esj.parseInpErrors(body, function (error, errorValue) {
                  sails.log.info("[actor login] login request  error : " + error + " ,value : " + errorValue)
                  return callback({msg: error ? error : errorValue})
                })
              }
              else {
                esj.parsePasswordExpirationDate(body, function (error, passwordExpirationDate) {
                  if (error)
                    return callback({msg: error})

                  sails.log.info("password expiry date  : " + parseInt(passwordExpirationDate));
                  var expirationDate = parseInt(passwordExpirationDate);
                  var currentTimestamps = (new Date()).getTime();
                  if (expirationDate < currentTimestamps) {
                    sails.log.info("It is expired  change pin : true");
		    user.change_pin = true;
                    //res.json({change_pin: true});
                    //return null;
                  } else {
                    user.change_pin = false;
                  }
                  return callback(null,body);
                })
              }
            }, {timeout: esj.requestTimeOut})
          })
        },
        function checkProfileCode(body,callback){
          esj.parseLoginProfileCode(body,function (error, profileCode) {
            if (error)
              return callback({msg: error});
            if (profileCodes.indexOf(profileCode)!=-1){
	      if (user.change_pin) {
                res.json({profileCode:profileCode,change_pin: true});
                return null;
              }

              return callback(null,profileCode)
            }else{
              return callback({msg: 'invalid_profile_code'});
            }
          });
        },
        function getSOFId(profileCode,callback) {
          sails.log.info("Inside get SOFId ");
          soap.createClient(sails.config.connections.sourceoffundUrl, function (err, client) {
            if (err) {
              sails.log.info("eserv error on create soap : " + phonenumber)
              return callback({msg: "soap_connection_error"})
            }

            var request = esj.getSourceOfFundRequest(false)
            request.payload.requester.accessValue = phonenumber
            request.payload.requester.password = pin


            console.log("request before soap call ", request);
            //initiate the getMyEligibleSoF API
            client.getMyEligibleSoF(request, function (err, result, body) {
              console.log("request ", request);
              console.log("----request ---" +  request);
              sails.log.info("printing the body  " + body);
              sails.log.info("Calling getMyEligibleSoF in actor login ");
              if (err) {
                sails.log.info("error  " + err);
                esj.parseTncErrors(body, function (error, errorValue) {
                  sails.log.info("printing the body in parse Tnc errors " + body);
                  sails.log.info("[actor login] eserv login : getMyEligibleSoF error : " + error + " ,value : " + errorValue)
                  return callback({msg: error ? error : errorValue})
                })
              }
              else
                esj.parseSOFId(body, function (error, id) {
                  sails.log.info("inside parseSOFId" + id);
                  if (error) {
                    sails.log.info("[actor login] error" + error);
                    return callback({msg: error})
                  }
                  user.sofId = id
                  return callback(null,profileCode)
                })
            }, {timeout: esj.requestTimeOut})
          })
        },
        function sendOtp(profileCode,callback) {
          // var queue = require('bulkhead-kue');
          var otp = math.randomInt(1000, 9999)
          sails.log.info(sails.config.connections.UAT);
          sails.log.info(sails.config.connections.UAT == true);
          if(sails.config.connections.UAT == true){
            otp = 1111;
          }
          // queue.create('SMPP', 'Send SMS', {name: 'sms'}, function (results, job) {
          //   sails.log.info("Inside Send Otp ");
          //   var session = smpp.connect(sails.config.connections.smsGateway);
          //   console.log("session ", session);
          //   sails.log.info("sms gate aways  " + sails.config.connections.smsGateway);
          //   sails.log.info("session " + session.toString());
          //   console.log("session  --" + session);
          //   session.bind_transceiver({
          //     system_id: sails.config.connections.username,
          //     password: sails.config.connections.password,
          //     system_type: 'SMPP',
          //     interface_version: 52
          //   }, function (pdu) {
          //     sails.log.info("before establishing session")
          //     for (var k in smpp.errors) {
          //       if (smpp.errors[k] == pdu.command_status) {
          //         sails.log.info("Smpp Error " + k);
          //       }
          //     }
          //     if (pdu.command_status == 0) {
          //       sails.log.info("smsc : established session")
                var shortMessage = "Your One-Time Password is : " + otp.toString() + " Dont share the Pin Code with anyone";
                if (os && os=="android"){
                  shortMessage="<#> "+shortMessage+"\n"+sails.config.connections.androidSMSKey;
                }
                sms.send(shortMessage,phonenumber.toString());
                // Successfully bound
          //       session.submit_sm({
          //         source_addr_ton: 5,
          //         source_addr_npi: 0,
          //         dest_addr_ton: 1,
          //         dest_addr_npi: 1,
          //         source_addr: "ZainCash",
          //         destination_addr: phonenumber.toString(),
          //         short_message: shortMessage
          //       }, function (pdu) {
          //         if (pdu.command_status == 0) {
          //           sails.log.info("smsc : sms sent")
          //           // Message successfully sent
          //           // res.json({sofId: sofId, otp: otp, token: jwToken.issue({phonenumber: phonenumber, sofId: sofId})});
          //         }
          //         else {
          //           sails.log.info("smsc : error sending sms")
          //           return callback({msg: "sending_otp_error"})
          //         }
          //       });
          //     }
          //     else {
          //       sails.log.info("smsc : error in session")
          //       return callback({msg: "sending_otp_error"})
          //     }
          //   });
          // }, function (err, results) {
          //   // Callback that is fired when the job is saved into the queue
          //   console.log(results.response().name) // Outputs 'sms'
          // });

          // queue.process('SMPP', 'Send SMS', null, function (job, next) {
          //   job.attempts(3)
          //   // Callback that is fired per job being processed
          //   console.log(job.data.name) // Outputs 'bob'
          //   next(undefined, job.data); // Moves on to the next job to process
          // })
          res.json({profileCode:profileCode,sofId: user.sofId,change_pin:user.change_pin, otp: otp, token: jwToken.issue({phonenumber: phonenumber, sofId: user.sofId})});
        }
      ],
      function (err, results) {
        if (err) {
          err.msg = err.msg != undefined ? err.msg : "unknown_error"
          sails.log('ESERV ERROR ' + err.msg)
          return res.json(401, {err: err.msg});
        }
        return res.serverError()
      }
    );
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

    if (!phonenumber || !pin || !newPin)
      return res.json({success: 0, err: "validation_error"});
    async.waterfall([
        function changeSelfPin(callback) {
          soap.createClient(sails.config.connections.actorUrl, function (err, client) {
            if (err)
              return callback({msg: "soap_connection_error"})

            //populate parameters
            esj.actorSelfPinChange.payload.requester.accessValue = phonenumber
            esj.actorSelfPinChange.payload.requester.externalSessionId = esj.customerSessionId(phonenumber)
            esj.actorSelfPinChange.payload.pinCode = newPin

            //initiate the domesticTransfer API
            client.actorSelfPinChange(esj.actorSelfPinChange, function (err, result, body) {
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

            var request = esj.getSourceOfFundRequest(false)
            request.payload.requester.accessValue = phonenumber
            request.payload.requester.password = newPin

            //initiate the getMyEligibleSoF API
            client.getMyEligibleSoF(request, function (err, result, body) {
              if (err)
                esj.parseTncErrors(body, function (error, errorValue) {
                  return callback({msg: error ? error : errorValue})
                })
              else
                esj.parseSOFId(body, function (error, id) {
                  if (error)
                    return callback({msg: error})

                  res.json({success: 1, sofId: id, token: jwToken.issue({phonenumber: phonenumber, sofId: id})});
                  return null;
                })
            }, {timeout: esj.requestTimeOut})
          })
        }
      ],
      function (err, results) {
        if (err) {
          err.msg = err.msg != undefined ? err.msg : "unknown_error"
          return res.json(401, {err: err.msg});
        }
        return res.serverError()
      });
  },
  /**
   * `ActorController.sendOtp()`
   *
   */
  sendOtp: function (req, res) {
    var params = req.params.all()
    var phonenumber = params.phone
    var os = params.os

    if (!phonenumber)
      return res.json({success: 0, err: "validation_error"});
    async.waterfall([
        function sendOtp(callback) {
          // var queue = require('bulkhead-kue');
          var otp = math.randomInt(1000, 9999)
          sails.log.info(sails.config.connections.UAT);
          sails.log.info(sails.config.connections.UAT == true);
          if(sails.config.connections.UAT == true){
            otp = 1111;
          }
          // queue.create('SMPP', 'Send SMS', {name: 'sms'}, function (results, job) {
          //   sails.log.info("Inside Send Otp ");
          //   var session = smpp.connect(sails.config.connections.smsGateway);
          //   console.log("session ", session);
          //   sails.log.info("sms gate aways  " + sails.config.connections.smsGateway);
          //   sails.log.info("session " + session.toString());
          //   console.log("session  --" + session);
          //   session.bind_transceiver({
          //     system_id: sails.config.connections.username,
          //     password: sails.config.connections.password,
          //     system_type: 'SMPP',
          //     interface_version: 52
          //   }, function (pdu) {
          //     sails.log.info("before establishing session")
          //     for (var k in smpp.errors) {
          //       if (smpp.errors[k] == pdu.command_status) {
          //         sails.log.info("Smpp Error " + k);
          //       }
          //     }
          //     if (pdu.command_status == 0) {
          //       sails.log.info("smsc : established session")
                var shortMessage = "Your One-Time Password is : " + otp.toString() + " Dont share the Pin Code with anyone";
		if (os && os=="android"){
                  shortMessage="<#> "+shortMessage+"\n"+sails.config.connections.androidSMSKey;
                }
                sms.send(shortMessage,phonenumber.toString());
                // Successfully bound
          //       session.submit_sm({
          //         source_addr_ton: 5,
          //         source_addr_npi: 0,
          //         dest_addr_ton: 1,
          //         dest_addr_npi: 1,
          //         source_addr: "ZainCash",
          //         destination_addr: phonenumber.toString(),
          //         short_message: shortMessage
          //       }, function (pdu) {
          //         if (pdu.command_status == 0) {
          //           sails.log.info("smsc : sms sent")

          //         }
          //         else {
          //           sails.log.info("smsc : error sending sms")
          //           return callback({msg: "sending_otp_error"})
          //         }
          //       });
          //     }
          //     else {
          //       sails.log.info("smsc : error in session")
          //       return callback({msg: "sending_otp_error"})
          //     }
          //   });
          // }, function (err, results) {
          //   // Callback that is fired when the job is saved into the queue
          //   console.log(results.response().name) // Outputs 'sms'
          // });

          // queue.process('SMPP', 'Send SMS', null, function (job, next) {
          //   job.attempts(3)
          //   // Callback that is fired per job being processed
          //   console.log(job.data.name) // Outputs 'bob'
          //   next(undefined, job.data); // Moves on to the next job to process
          // })
          res.json({otp: otp});
        }
      ],
      function (err, results) {
        if (err) {
          err.msg = err.msg != undefined ? err.msg : "unknown_error"
          return res.json(401, {err: err.msg});
        }
        return res.serverError()
      });
  },
  /**
   * `ActorController.registerUser()`
   *
   */
   registerUser: function (req, res) {
    var params = req.params.all()
    var phonenumber = params.phone
    var lang = params.lang
    //var request = require('request');

    if (!phonenumber || !lang)
      return res.json({success: 0, err: "validation_error"});

    function callback(error, response, body) {
      console.log(response);
      if (!error && response.return.status.code == 0) {
        try {
          var data = response.return.data;
          return res.json({success: 1, data: data.response.status.message});
        } catch (e) {
          return res.json({success: 0, err: "error_creating_wallet"});
        }
      }else{
        return res.json({success: 0, err: "error_creating_wallet"});
      }
    }

    var content = 'REGISTER';

    if(lang !== 'english')
      content = lang.charAt(0).toUpperCase() + lang.slice(1);

    var args = {
      username: sails.config.connections.ussdUsername,
      password: sails.config.connections.ussdPassword,
      eventName: 'USSD_Reg',
      sender: phonenumber,
      destination: '*210#',
      content: content
    };
console.log('test');
    soap.createClient(sails.config.connections.ussdUrl, function(err, client) {
      if (err) {
        sails.log.info("eserv error on create soap : " + phonenumber)
        return callback({msg: "soap_connection_error"})
      }

      client.CallEventByNamePrefixRequest(args, callback);
    });
  },

}




