var jwt = require('jsonwebtoken');
var https = require('https');

module.exports.send = function (message,phoneNumber) {
        var payload = {
            "msg":message,
            "to":phoneNumber
        };
        jwt.sign(payload,sails.config.connections.SMSSecretKey, {expiresIn: '1h'}, function (err, token) {
            if (token){
                var data = {
                    token:token,
                    from:sails.config.connections.SMSFromSender
                };

                const options = {
                  hostname: sails.config.connections.SMSHost,
                  port: 443,
                  path: sails.config.connections.SMSAPI,
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                  }
                }

                const req = https.request(options, res => {
                  console.log(`SMS API statusCode: ${res.statusCode}`)

                  res.on('data', d => {
                    console.log("SMS request response",d);
                  });
                });

                req.on('error', error => {
                  console.error("sms request error: ",error);
                });

                req.write(data);
                req.end();


            }
        });

}
