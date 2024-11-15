/**
 * MoneyRequestController
 *
 * @description :: Server-side logic for requesting money
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var smpp = require('smpp');
    // queue = require('bulkhead-kue');

module.exports = {
  sendSms: function(req, res) {
    var short_message = req.param('short_message');
    var send_to = req.param('send_to');

    if (!short_message || !send_to) {
      return res.json(401, {err: 'short message and receiver phone are required'});
    }

    sms.send(short_message,send_to);
    return res.json({"success": true});
    //create new job in the queue
    // queue.create('SMPP', 'Send SMS', {name: 'sms'}, function (results, job) {
    //   //creating an smpp session
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
    //       sails.log.info("smsc : established session")

    //       // Successfully bound
    //       session.submit_sm({
    //         source_addr_ton: 5,
    //         source_addr_npi: 0,
    //         dest_addr_ton: 1,
    //         dest_addr_npi: 1,
    //         source_addr: "ZainCash",
    //         destination_addr: send_to,
    //         short_message: short_message
    //       }, function (pdu) {
    //         if (pdu.command_status == 0) {
    //           sails.log.info("smsc : sms sent")
    //           // Message successfully sent
    //           return res.json({"success": true});
    //         }
    //         else {
    //           sails.log.info("smsc : error sending sms")
    //           return callbackify({msg: "sending_sms_error"});
    //         }
    //       });
    //     }
    //     else {
    //       sails.log.info("smsc : error in session");
    //       return callbackify({msg: "sending_sms_error"});
    //     }
    //   });
    // }, function (err, results) {
    //   // Callback that is fired when the job is saved into the queue
    //   console.log(results.response().name) // Outputs 'sms'
    //   if (err) {
    //     return res.json(401, {err: err.msg});
    //   }
    // });

    // queue.process('SMPP', 'Send SMS', null, function (job, next) {
    //   job.attempts(3);
    //   // Callback that is fired per job being processed
    //   console.log(job.data.name); // Outputs 'sms'
    //   next(undefined, job.data); // Moves on to the next job to process
    // });
  }
}
