module.exports = {

  validateTransactionTimeStamp: function (transaction, callback) {
    // get the time stamp from the server not the client
    var date = new Date(transaction.createdAt)

    Configuration.getIntValue("transaction_access_expired_after_minutes", function (err, nbOfMinutes) {
      if (err)
        return callback({msg: "transaction_access_expired"});

      var timediff = Math.abs(((Date.now() - date) / 1000) / 60)
      if (timediff > nbOfMinutes) {
        return callback({msg: "transaction_access_expired"})
      }
      return callback(null)
    });

  },

  validateProcessingData: function (data, callback) {
    /*if (this.checkEmpty(data.g_recaptcha_response) || this.checkEmpty(data.g_recaptcha_response)) {
      return callback({msg: "validation_captcha"})
    }*/
    if (this.checkEmpty(data.pin) || this.checkEmpty(data.phonenumber)) {
      return callback({msg: "missing_or_invalid_parameters"})
    }
    if (this.checkEmpty(data.pin) || this.checkEmpty(data.phonenumber)) {
      return callback({msg: "missing_or_invalid_parameters"})
    }
    if (!this.isValideId(data.id)) {
      return callback({msg: "invalid_transaction_id"})
    }
    return callback(null)
  },
  validateProcessingOtpData: function (data, callback) {
    var otp=data.otp;
    if (this.checkEmpty(otp)) {
      return callback({msg: "missing_or_invalid_otp"})
    }
    if (!this.isValideId(data.id)) {
      return callback({msg: "invalid_transaction_id"})
    }
    return callback(null, data)
  },

  checkEmpty: function (value) {
    if (value === undefined || value === "" || value === '' || value === null) {
      return true;
    }
    return false;
  },

  isValideId: function (value) {
    // Regular expression that checks for hex value
    var checkForHexRegExp = new RegExp("^[0-9a-fA-F]{24}$");

    if (checkForHexRegExp.test(value)) {
      return true;
    }
    return false;
  },

  isNumeric: function (n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

};
