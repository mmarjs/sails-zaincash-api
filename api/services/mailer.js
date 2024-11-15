//var nodemailer = require('nodemailer');

module.exports.send = function (subject, text, from, to) {
    
    //var transporter = nodemailer.createTransport(sails.config.mail.info);
    var mailOptions = buildEmailOptions(subject, text, from, to);
    sails.log.info('Mail options: ' + JSON.stringify(mailOptions));
    /*transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
            sails.log.error('EMAIL_ERROR', error);
        } else {
            sails.log.info('EMAIL_SENT: ', info.response);
        }
    });*/

}

function buildEmailOptions(subject, text, from, to) {
    return {
        from: from || sails.config.mail.fromAddress,
        to: to || sails.config.mail.toAddtess,
        subject: subject,
        text: text
    }
}