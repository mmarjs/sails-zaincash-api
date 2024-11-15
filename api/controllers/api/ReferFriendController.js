/**
 * Linking Card Controller
 *
 * @description :: Server-side logic for Lonking Card transactions
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var soap = require('soap');


module.exports = {
  topUpWallet: function (req, res) {
    var data;
    var params = req.params.all();
    var pin = sails.config.connections.cashhbackPassword;
    var phonenumber = sails.config.connections.cashhbackWallet;

    if (!req.token.phonenumber) {
      return res.json(401, {success: 0, err: 'user_phonenumber_not_valid'});
    }

    //get authorization from the header
    parts = req.headers.authorization.split(' ');
    token = parts[1];


    async.waterfall([
      function (callback) {
        initialValidation(callback, params);
      },
      function (tranData, callback) {
        data = tranData;
        checkIfBankExists(callback, data.bankId);
      },
      function (bank, callback) {
        data.token = token;
        data.bankMsisdn = bank.msisdn;
        performTransactions(callback, req.token.phonenumber, phonenumber, pin, data);
      }, function (transaction, callback) {
        res.status(200).send({
          success: 1,
          operationId: transaction.operationId,
          newBalance: typeof transaction['creditedNewBalance'] != 'undefined' ? transaction['creditedNewBalance'].slice(0, -5) : ''
        });
      }
    ], function (err) {
      res.json(400, {success: 0, err: err.msg});
    });
  }
}

/**
 * Transfer money from main wallet to customer's wallet and transfer comission fee from main wallet to the bank
 * The operations are being perfomed in parallel - In case any or both of the transactions failed an email
 * will be sent to zain cash informing them about the error - In case one of the transactions failed
 * the other will be reversed
 *
 *
 * @param {function} callback
 * @param {number} requesterPhoneNumber
 * @param {number} requesterPin
 * @param {number} mainWalletPin
 * @param {number} mainWalletPhoneNumber
 *
 * @returns {function}
 */
function performTransactions(callback, requesterPhoneNumber, mainWalletPhoneNumber, mainWalletPin, data) {

  var transactions = {
    topUp: function (callback1) {
      var topUpData = buildTopUpData(data.token, requesterPhoneNumber, data.amount);
      payment.domesticTransfer(callback1, topUpData, mainWalletPhoneNumber, mainWalletPin, false);
    }
  };
  async.parallel(transactions, function (err, results) {
    if (err) {
      return callback(err);
    }

    var topUpTransaction = results.topUp.transaction;
    var emailTopUpInfo = {
      amount: topUpTransaction.amount,
      transactionId: topUpTransaction.id,
      phonenumber: requesterPhoneNumber,
      error: results.topUp.msg
    };

    if (data.commissionFees == 0) {
      if (results.topUp.success == 0) {
        var info = {topUp: emailTopUpInfo};
        var emailData = getEmailData(['TOP_UP'], info);
        mailer.send(emailData.subject, emailData.message);

        return callback(results.topUp);
      }
    } else {
      try {
        bankCommissionTransaction = results.commission.transaction;
        bankCommissionTransaction.parent = topUpTransaction;

        bankCommissionTransaction.save(function (err) {
          if (err) {
            sails.log.error('Bank Comission Transaction could not be updated', err);
          }
        });
      } catch (err) {
        sails.log.error('Bank Comission Transaction could not be updated', err);
      }

      var commissionInfo = {
        amount: bankCommissionTransaction.amount,
        transactionId: bankCommissionTransaction.id,
        phonenumber: data.bankMsisdn,
        parentTransactionId: topUpTransaction.id,
        error: results.commission.msg
      };

      // if both transactions failed return error message of the first transaction
      if (results.topUp.success == 0 && results.commission.success == 0) {
        keys = ['TOP_UP', 'BANK_COMMISSION'];

        var info = {topUp: emailTopUpInfo, commission: commissionInfo};
        var emailData = getEmailData(keys, info);
        mailer.send(emailData.subject, emailData.message);

        return callback(results.topUp);
      }

      // if first transaction failed and the other was successfull return the error of the first transaction and reverse the other
      if (results.topUp.success == 0 && results.commission.success == 1) {
        try {
          emailTopUpInfo.revesal = true;
          emailTopUpInfo.reversalInfo = {
            transactionId: bankCommissionTransaction.id,
            operationId: bankCommissionTransaction.operationId
          };

          var info = {topUp: emailTopUpInfo};
          var emailData = getEmailData(['TOP_UP'], info);
          mailer.send(emailData.subject, emailData.message);

          var extraData = {reversalType: 'bank commission fee transaction'};
          var reversalData = buildReversalData(bankCommissionTransaction, 'LINKING_CARD_BANK_COMMISSION_REVERSAL');
          payment.domesticTransferReversal(reversalCallback, bankCommissionTransaction, reversalData, mainWalletPin, mainWalletPhoneNumber, extraData);
        } catch (err) {
          sails.log.error('LINKING_CARD_BANK_COMMISSION_REVERSAL| ' + results.commission.transaction.operationId, err);
        }
        return callback(results.topUp);
      }

      // if second transaction failed and the other was successfull return the error of the second transaction and reverse the other
      if (results.topUp.success == 1 && results.commission.success == 0) {
        try {
          commissionInfo.revesal = true;
          commissionInfo.reversalInfo = {
            transactionId: topUpTransaction.id,
            operationId: topUpTransaction.operationId
          }

          var info = {commission: commissionInfo};
          var emailData = getEmailData(['BANK_COMMISSION'], info);
          mailer.send(emailData.subject, emailData.message);

          var extraData = {reversalType: 'Top Up transaction'};
          var reversalData = buildReversalData(topUpTransaction, 'LINKING_CARD_TOPUP_REVERSAL');
          payment.domesticTransferReversal(reversalCallback, topUpTransaction, reversalData, mainWalletPhoneNumber, mainWalletPin, extraData);
        } catch (err) {
          sails.log.error('LINKING_CARD_TOPUP_REVERSAL| ' + results.topUp.transaction.operationId, err);
        }
        return callback(results.commission);
      }
    }

    return callback(null, topUpTransaction);
  });

}


/**
 * Get Email data
 *
 * @param {array} keys
 * @param {object} info
 *
 * @returns {object}
 */
function getEmailData(keys, info) {
  var subject = 'CASHBACK PAYMENT ISSUE';
  var message = '';

  for (var i = 0; i < keys.length; i++) {
    if (message != '') {
      message += '\n\n';
    }

    message += buildMessage(keys[i], info);
  }

  return {subject: subject, message: message};
}

/**
 * Build the msssage that will be sent to zain cash by email
 *
 * @param {array} key
 * @param {object} info
 * @param {string} message
 *
 * @returns {string}
 */
function buildMessage(key, info) {
  switch (key) {
    case 'TOP_UP':
      var message = buildTopUpMessage(info.topUp);
      break;
    case 'BANK_COMMISSION':
      var message = buildCommissionMessage(info.commission);
      break;
    case 'REVERSAL':
      var message = buildReversalMessage(info.revesal);
      break;
  }

  return message;
}

/**
 * Build the Linking Card Top Up transaction message that will be sent by Email to Zain Cash
 * in case the transaction Failed
 *
 * @param {object} info
 *
 * @returns {string}
 */
function buildTopUpMessage(info) {
  var message = '- Failed to transfer ' + info.amount + ' IQD from main wallet to customer\'s wallet (' + info.phonenumber + '),'
    + '\nMongo DB transaction ID: ' + info.transactionId
    + '\nError Message: ' + info.error;

  if (info.revesal == true) {
    message += '\n\n- Bank Comission transction (MongoID: ' + info.reversalInfo.transactionId + ', Operation ID: ' + info.reversalInfo.operationId + ') will be reversed'
      + '\n In case reversal Failed you will receive another email';
  }

  return message;
}

/**
 * Build the Linking Card Bank Commission transaction message that will be sent by Email to Zain Cash
 * in case the transaction Failed
 *
 * @param {object} info
 *
 * @returns {string}
 */
function buildCommissionMessage(info) {
  var message = '- Failed to transfer commission fees (' + info.amount + ' IQD) from main wallet to the bank (' + info.phonenumber + ')'
    + '\nMongo DB transaction ID: ' + info.transactionId
    + '\nMongo DB Parent Top-Up transaction ID: ' + info.parentTransactionId
    + '\nError Message: ' + info.error;

  if (info.revesal == true) {
    message += '\n\n- Top Up transaction (MongoID: ' + info.reversalInfo.transactionId + ', Operation ID: ' + info.reversalInfo.operationId + ') will be reversed'
      + '\n In case reversal Failed you will receive another email';
  }

  return message;
}

/**
 * Build the reversal transaction message that will be sent by Email to Zain Cash
 * in case the transaction Failed
 *
 * @param {object} info
 *
 * @returns {string}
 */
function buildReversalMessage(info) {
  var message = '- Failed to reverse ' + info.reversalType + ' from ' + info.phonenumber + ' to the main wallet'
    + '\nMongo DB transaction ID: ' + info.transactionId
    + '\n Mongo DB parent transaction ID ' + info.parentTransactionId
    + '\n Parent Operation ID: ' + info.parentOperationId
    + '\n Error Message: ' + info.error;

  return message;
}

/**
 * Build the data that will be saved in the Linking Card Reversal transaction
 *
 * @param {object} topUpTransaction
 *
 * @returns {object}
 */
/**
 * Build the data that will be saved in the Linking Card Reversal transaction
 *
 * @param {object} topUpTransaction
 *
 * @returns {object}
 */
function buildReversalData(transaction, comment) {
  return {
    token: transaction.token,
    source: 'mobile',
    type: 'DOMESTIC_TRANSFER_REVERSAL',
    status: 'pending_reversal',
    amount: parseInt(transaction.amount),
    credit: true,
    transfer_to: transaction.from,
    from: transaction.transfer_to,
    serviceType: 'Reversal',
    parent: transaction,
    comment: comment
  };
}

function buildTopUpData(token, phonenumber, amount) {
  return {
    token: token,
    from: sails.config.connections.linkCardCommissionWallet,
    source: 'mobile',
    type: 'DOMESTIC_TRANSFER',
    amount: amount,
    transfer_to: phonenumber,
    status: 'pending',
    serviceType: 'REFER_FRIEND_CASHBACK',
    comment: 'Refer friend cashback'
  }
}

/**
 * Only checks if all the required params are sent and perform some general validation
 *
 * @param {function} callback
 * @param {object} params
 * @param {object} data
 */
function initialValidation(callback, params) {

  var amount = typeof params.amount == 'number' ? parseInt(params.amount) : null;
  var commissionFees = typeof params.commissionFees == 'number' ? parseInt(params.commissionFees) : null;

  if (!params.bankId || !params.serviceType) {
    return callback({msg: 'missing_parameters'});
  }

  if (!params.amount || parseInt(params.amount) < sails.config.connections.minAmount) {
    return callback({msg: 'invalid_transfer_amount'})
  }

  /*if (commissionFees === null || commissionFees < 0 || commissionFees > amount || (commissionFees != 0 && commissionFees < sails.config.connections.minAmount)) {
      return callback({ msg: 'invalid_comission_fees' });
  }*/

  return callback(null, buildDataObject(params));
}

/**
 * Buoild Data object
 *
 * @param {object} params
 */
function buildDataObject(params) {
  return {
    bankId: params.bankId,
    serviceType: params.serviceType,
    amount: parseInt(params.amount),
    commissionFees: parseInt(params.commissionFees)
  };
}

/**
 * Check if the bank exists based on the bankId
 *
 * @param {function} callback
 */
function checkIfBankExists(callback, bankId) {
  Banks.findOne({
    id: bankId,
    deleted: false
  }, function (err, bank) {
    if (!bank) {
      return callback({msg: 'bank_not_found'});
    }
    return callback(null, bank);
  });
}

