var parseString = require('xml2js').parseString,
  requesterPin = {
    "accessMedium": "MOBILEAPP",
    "domainId": "1",
    "accessType": "MSISDN",
    "accessValue": undefined, //variable
    "password": undefined, //vaiable
  },
  requesterSessionId = {
    "accessMedium": "MOBILEAPP",
    "domainId": "1",
    "accessType": "MSISDN",
    "accessValue": undefined, //variable
    "externalSessionId": undefined, //vaiable
  },
  requesterAdmin = {
    "accessMedium": "MOBILEAPP",
    "domainId": "1",
    "accessType": "MSISDN",
    "accessValue": sails.config.connections.eservAdminUsername,
    "password": sails.config.connections.eservAdminPassword
  };

module.exports = {
  requestTimeOut: 180000,
  findPeerRequest: {
    "payload": {
      "requester": requesterPin,
      "actorIdentifier": undefined
    }
  },
  getActorDetailsRequest: {
    "payload": {
      "requester": requesterPin,
      "actorId": undefined
    }
  },
  getSourceOfFundRequest: function (withSession) {
    sails.log.info("with session " + withSession);
    request = {
      "payload": {
        "requester": withSession ? requesterSessionId : requesterPin,
        "operation": "DEBIT",
        "operationType": "COMPUTE_SERVICE_CHARGE",
        "service": "EMONEY",
        "sofCurrencyId": "2",
      }
    }
    if (withSession) {
      delete request.payload.requester.password
    } else {
      delete request.payload.requester.externalSessionId
    }
    return request
  },

  getMySoFBalanceRequest: function (withSession) {
    return {
      "payload": {
        "requester": withSession ? requesterSessionId : requesterPin,
        "sofId": undefined
      }
    }
  },

  merchantPaymentComputeServiceChargeRequest: {
    "payload": {
      "requester": requesterPin,
      "amount": undefined,
      "currencyId": "2",
      "targetOperationType": undefined,
      "debitedActor": {
        "type": "ACTORID",
        "identifier": undefined
      },
      "debitedSofId": undefined,
      "creditedActor": {
        "type": "MSISDN",
        "identifier": undefined
      }
    }
  },

  computeServiceChargeRequest: {
    "payload": {
      "requester": requesterPin,
      "amount": undefined,
      "currencyId": "2",
      "targetOperationType": undefined,
      "debitedActor": {
        "type": "ACTORID",
        "identifier": undefined
      },
      "debitedSofId": undefined
    }
  },

  merchantPaymentRequest: {
    "payload": {
      "requester": requesterPin,
      "externalIdList": {
        "externalId": {
          "name": "mobile money",
          "value": "mobile app"
        }
      },
      "requestPropertyList": {
        "requestProperty": {
          "name": "merchantPayment",
          "value": "mobile request"
        }
      },
      "quantity": undefined,
      "debitedSofId": undefined, //variable
      "currencyId": "2",
      "beneficiary": {
        "type": "MSISDN",
        "identifier": undefined //variable
      },
      "comment": "bla",
      "notificationPolicyList": {
        "notificationPolicy": [{
          "operationPartyRole": "SENDER",
          "successNotificationFlag": "YES",
          "failureNotificationFlag": "YES"
        }, {
          "operationPartyRole": "RECEIVER",
          "successNotificationFlag": "YES",
          "failureNotificationFlag": "YES"
        }]
      }
    }
  },
  merchantPaymentReversalRequest: {
    "payload": {
      "requester": requesterPin,
      "operationId": undefined,
      "comment": "Merchant Payment Reversal",
      "notificationPolicyList": {
        "notificationPolicy": [{
          "operationPartyRole": "SENDER",
          "successNotificationFlag": "YES",
          "failureNotificationFlag": "YES"
        }, {
          "operationPartyRole": "RECEIVER",
          "successNotificationFlag": "YES",
          "failureNotificationFlag": "YES"
        }]
      }
    }
  },
  domesticTransferRequest: {
    "payload": {
      "requester": requesterPin,
      "externalIdList": {
        "externalId": {
          "name": "mobile money",
          "value": "mobile app"
        }
      },
      "requestPropertyList": {
        "requestProperty": {
          "name": "merchantPayment",
          "value": "mobile request"
        }
      },
      "quantity": undefined,
      "debitedSofId": undefined, //variable
      "currencyId": "2",
      "beneficiary": {
        "type": "MSISDN",
        "identifier": undefined //variable
      },
      "comment": "bla",
      "notificationPolicyList": {
        "notificationPolicy": [{
          "operationPartyRole": "SENDER",
          "successNotificationFlag": "YES",
          "failureNotificationFlag": "YES"
        }, {
          "operationPartyRole": "RECEIVER",
          "successNotificationFlag": "YES",
          "failureNotificationFlag": "YES"
        }]
      }
    }
  },

  domesticTransferReversalRequest: {
    "payload": {
      "requester": requesterPin,
      "operationId": undefined,
      "comment": "DOMESTIC_TRANSFER_REVERSAL",
      "notificationPolicyList": {
        "notificationPolicy": [{
          "operationPartyRole": "SENDER",
          "successNotificationFlag": "YES",
          "failureNotificationFlag": "YES"
        }, {
          "operationPartyRole": "RECEIVER",
          "successNotificationFlag": "YES",
          "failureNotificationFlag": "YES"
        }]
      }
    }
  },
  salaryTransferRequest: {
    "payload": {
      "requester": requesterPin,
      "employer": {
          "type": "MSISDN",
          "indetifier": undefined
      },
      "quantity": undefined,
      "currencyId": "2",
      "employee": {
        "type": "MSISDN",
        "identifier": undefined
      },
      "comment":"",
      "notificationPolicyList": {
        "notificationPolicy": [{
          "operationPartyRole": "SENDER",
          "successNotificationFlag": "YES",
          "failureNotificationFlag": "YES"
        }, {
          "operationPartyRole": "RECEIVER",
          "successNotificationFlag": "YES",
          "failureNotificationFlag": "YES"
        }]
      }
    }
  },

  cashoutRequest: {
    "payload": {
      "requester": requesterPin,
      "amount": undefined,
      "currencyId": "2",
      "debitedBalanceId": undefined, //variable
      "debitedBalanceChosenExplicitly": "YES",
      "agent": {
        "type": "SHORTCODE",
        "identifier": undefined //variable
      },
      "comment": "cashout",
      "sendBeneficiarySuccessNotification": "YES",
      "sendAgentSuccessNotification": "YES",
    }
  },

  getMyLastFinancialTransactionsRequest: {
    "payload": {
      "requester": requesterPin,
      "maxReturnResults": undefined,
      "sourceOfFundsId": undefined
    }
  },

  loginRequest: {
    "payload": {
      "requester": requesterPin,
      "sessionIdSeed": undefined,
    }
  },
  logoutRequest: {
    "payload": {
      "requester": requesterSessionId,
    }
  },
  myCatalogArticlesSearchRequest: {
    "payload": {
      "requester": requesterSessionId,
    }
  },

  selfTopUp: {
    "payload": {
      "requester": requesterPin,
      "articleId": undefined,
      "quantity": undefined,
      "debitedBalanceId": undefined,
      "comment": "SELF_TOPUP_FROM_MOBILE_APP",
      "senderSuccessNotificationFlag": "YES"
    }
  },
  thirdTopUp: {
    "payload": {
      "requester": requesterPin,
      "articleId": undefined,
      "quantity": undefined,
      "debitedBalanceId": undefined,
      "comment": "THIRD_TOPUP_FROM_MOBILE_APP",
      "beneficiary": {
        "type": "MSISDN",
        "identifier": undefined //variable
      },
      "senderSuccessNotificationFlag": "YES"
    }
  },

  billExternalPayment: {
    "payload": {
      "requester": requesterPin,
      "language": "en-GB",
      "billPayerSof": undefined,
      "billPayerSofChosenExplicitly": "YES",
      "billPaymentTypeCode": "POSTPAID_BILL",
      "billCurrencyCode": "2",
      "billAmount": undefined,
      "billDataList": {
        "billData": [{
          "key": "billReference",
          "value": undefined
        }]
      },
      "notifyPayer": "YES"
    }
  },

  actorSelfChangeLanguage: {
    "payload": {
      "requester": requesterPin,
      "language": undefined,
    }
  },
  actorSelfPinChange: {
    "payload": {
      "requester": requesterPin,
      "pinCode": undefined,
    }
  },
  actorGetDetails: {
    "payload": {
      "requester": requesterAdmin,
      "actorId": undefined,
    }
  },
  findPeer: {
    "payload": {
      "requester": requesterAdmin,
      "actorIdentifier": undefined
    }
  },
  merchantSessionId: function (merchant) {
    //merchant.secret is not the actual password , it an encrypted string
    //also we are adding a local key before generating the md5 for both
    var data = merchant.msisdn.toString() + sails.config.connections.eservSessionKey;
    var crypto = require('crypto');
    return crypto.createHash('md5').update(data).digest("hex");
  },

  customerSessionId: function (phonenumber) {
    //merchant.secret is not the actual password , it an encrypted string
    //also we are adding a local key before generating the md5 for both
    var data = phonenumber.toString() + sails.config.connections.eservSessionKey;
    var crypto = require('crypto');
    return crypto.createHash('md5').update(data).digest("hex");
  },

  defaultNumberSessionId: function () {
    //also we are adding a local key before generating the md5 for both
    var data = sails.config.connections.defaultNumber + sails.config.connections.eservSessionKey;
    var crypto = require('crypto');
    return crypto.createHash('md5').update(data).digest("hex");
  },

  parseTncErrors: function (body, callback) {
    return module.exports.parseErrorMessage(body, "tns", callback);
  },
  parseInpErrors: function (body, callback) {
    return module.exports.parseErrorMessage(body, "inp1", callback);
  },
  parseClientErrors: function (body, callback) {
    return module.exports.parseErrorMessage(body, "client", callback);
  },
  parseErrorMessage: function (body, type, callback) {
    parseString(body, function (err, result) {

      if (err)
        return callback(err)

      var errorMessage = result["env:Envelope"]["env:Body"][0]["env:Fault"][0];
      if (typeof errorMessage.detail!="undefined"){
        errorMessage = errorMessage.detail[0][type + ":WebServiceException"][0]["message"][0];
      }
      else{
        errorMessage = "read_time_out";
      }

      if (errorMessage === undefined)
        return callback("xml_parsing_errors")

      if (!errorMessage)
        return callback(null, "unknown_soap_error")


      return callback(null, errorMessage)
    })
  }
  ,

  parseSessionId: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var externalSessionId = result["env:Envelope"]["env:Body"][0]
        .loginResponse[0]
        .payload[0]
        .externalSessionId[0]

      return callback(null, externalSessionId)
    });
  },
  parsePasswordExpirationDate: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var passwordExpirationDate = result["env:Envelope"]["env:Body"][0]
        .loginResponse[0]
        .payload[0]
        .passwordExpirationDate[0]

      return callback(null, passwordExpirationDate)
    });
  }
  ,
  parseLoginProfileCode: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var profileCode = result["env:Envelope"]["env:Body"][0]
        .loginResponse[0]
        .payload[0]
        .requester[0]
        .profileCode[0];

      return callback(null, profileCode)
    });
  }
  ,
  parseSOFId: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var sofId = result["env:Envelope"]["env:Body"][0]
        .getMyEligibleSoFResponse[0]
        .payload[0]
        .sourceOfFundList[0]
        .sourceOfFund[0]
        .sofId[0]

      return callback(null, sofId)
    });
  }
  ,
  parseActorId: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)
      if(result != 'undefined'){
        try {
          var actorId = result["env:Envelope"]["env:Body"][0].findPeerResponse[0].payload[0].retrievedPeerList[0].retrievedPeer[0].actorId[0];
        }catch (e) {
          return callback({msg: 'no_response_from_zain_cash_please_try_again'});
        }
      }

      return callback(null, actorId)
    });
  },
  parseProfileCode: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var profileCode = result["env:Envelope"]["env:Body"][0]
        .actorGetDetailsResponse[0]
        .payload[0]
        .actor[0]
        .profileCode[0]

      return callback(null, profileCode)
    });
  },

  parseSOFOwnerId: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var ownerId = result["env:Envelope"]["env:Body"][0]
        .getMyEligibleSoFResponse[0]
        .payload[0]
        .sourceOfFundList[0]
        .sourceOfFund[0]
        .sofOwner[0]
        .ownerId[0]

      return callback(null, ownerId)
    });
  }
  ,

  parseBalanceValue: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var sofId = result["env:Envelope"]["env:Body"][0]
        .getMySoFBalanceResponse[0]
        .payload[0]
        .sourceOfFundBalance[0]
        .credit[0]

      return callback(null, sofId)
    });
  }
  ,

  parseFeeValue: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var amount = result["env:Envelope"]["env:Body"][0]
        .computeServiceChargeResponse[0]
        .payload[0]
        .amount[0]

        //on the merchant
      var amountIncluded = result["env:Envelope"]["env:Body"][0]
        .computeServiceChargeResponse[0]
        .payload[0]
        .amountIncluded[0]

        //on the customer
      var amountExcluded = result["env:Envelope"]["env:Body"][0]
        .computeServiceChargeResponse[0]
        .payload[0]
        .amountExcluded[0]

      return callback(null, amount, amountIncluded, amountExcluded)
    });
  }
  ,

  parseMerchantPaymentNewBalance: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)
      var data =
        {
          newbalance: result["env:Envelope"]["env:Body"][0]
            .merchantPaymentResponse[0]
            .payload[0]
            .receipt[0]
            .debited[0]
            .newBalance[0],
          operationId: result["env:Envelope"]["env:Body"][0]
            .merchantPaymentResponse[0]
            .payload[0]
            .receipt[0]
            .operationId[0]
        }

        var date = getDate(result);

        if (date != null) {
          data.operationDate = date;
        }

      return callback(null, data)
    });
  }
  ,

  parseDomesticTransfer: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)
      var data =
        {
          newbalance: result["env:Envelope"]["env:Body"][0]
            .domesticTransferResponse[0]
            .payload[0]
            .receipt[0]
            .debited[0]
            .newBalance[0],
          operationId: result["env:Envelope"]["env:Body"][0]
            .domesticTransferResponse[0]
            .payload[0]
            .receipt[0]
            .operationId[0]
        }

        var date = getDate(result);

        if (date != null) {
          data.operationDate = date;
        }

        var creditedBalance = getCreditedBalance(result);
        if (creditedBalance != null) {
          data.creditedNewBalance = creditedBalance;
        }

      return callback(null, data)
    });
  }
  ,

  parseDisburseSalary: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var data =
        {
          newbalance: result["env:Envelope"]["env:Body"][0]
            .disburseSalaryResponse[0]
            .payload[0]
            .receipt[0]
            .debited[0]
            .newBalance[0],
          operationId: result["env:Envelope"]["env:Body"][0]
            .disburseSalaryResponse[0]
            .payload[0]
            .receipt[0]
            .operationId[0]
        }

        var date = getDate(result);

        if (date != null) {
          data.operationDate = date;
        }

      return callback(null, data)
    });
  },
  parseMerchantPaymentReversal: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var data =
        {
          newbalance: result["env:Envelope"]["env:Body"][0]
            .merchantPaymentReversalResponse[0]
            .payload[0]
            .receipt[0]
            .debited[0]
            .newBalance[0],
          operationId: result["env:Envelope"]["env:Body"][0]
            .merchantPaymentReversalResponse[0]
            .payload[0]
            .receipt[0]
            .operationId[0]
        }

        var date = getDate(result);

        if (date != null) {
          data.operationDate = date;
        }

      return callback(null, data)
    });
  },

  parseDomesticTransferReversal: function (body, callback) {
    parseString(body, function (err,  result) {
      if (err) {
        return callback(err);
      }

      var data = {
        newBalance: result["env:Envelope"]["env:Body"][0]
          .domesticTransferReversalResponse[0]
          .payload[0]
          .receipt[0]
          .debited[0]
          .newBalance[0],
        operationId: result["env:Envelope"]["env:Body"][0]
          .domesticTransferReversalResponse[0]
          .payload[0]
          .receipt[0]
          .operationId[0]
      };

      var date = getDate(result);

      if (date != null) {
        data.operationDate = date;
      }

      return callback(null, data);
    });
  },
  parseTransactions: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var operationList = result["env:Envelope"]["env:Body"][0]
        .getMyLastFinancialTransactionsResponse[0]
        .payload[0]
        .operationList[0]
        .lastTransaction;

      return callback(null, operationList)
    });
  },
  parseCatalog: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var articleList = result["env:Envelope"]["env:Body"][0]
        .myCatalogArticlesSearchResponse[0]
        .payload[0]
        .articleList[0]
        .article;

      return callback(null, articleList)
    });
  },
  parseCashOut: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var data =
        {
          newbalance: result["env:Envelope"]["env:Body"][0]
            .cashOutOneShotByBeneficiaryResponse[0]
            .payload[0]
            .receipt[0]
            .debited[0]
            .newBalance[0],
          operationId: result["env:Envelope"]["env:Body"][0]
            .cashOutOneShotByBeneficiaryResponse[0]
            .payload[0]
            .receipt[0]
            .operationId[0]
        }

        var date = getDate(result);

        if (date != null) {
          data.operationDate = date;
        }

      return callback(null, data)
    });
  },
  parseSelfTopUp: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var data =
        {
          newbalance: result["env:Envelope"]["env:Body"][0]
            .selfTopUpResponse[0]
            .payload[0]
            .receipt[0]
            .debited[0]
            .newBalance[0],
          operationId: result["env:Envelope"]["env:Body"][0]
            .selfTopUpResponse[0]
            .payload[0]
            .receipt[0]
            .operationId[0]
        }

        var date = getDate(result);

        if (date != null) {
          data.operationDate = date;
        }

      return callback(null, data)
    });
  },
  parseThirdTopUp: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var data =
        {
          newbalance: result["env:Envelope"]["env:Body"][0]
            .thirdTopUpResponse[0]
            .payload[0]
            .receipt[0]
            .debited[0]
            .newBalance[0],
          operationId: result["env:Envelope"]["env:Body"][0]
            .thirdTopUpResponse[0]
            .payload[0]
            .receipt[0]
            .operationId[0]
        }

        var date = getDate(result);

        if (date != null) {
          data.operationDate = date;
        }

        return callback(null, data)
    });
  },

  parseBillPaymentTransfer: function (body, callback) {
    parseString(body, function (err, result) {
      if (err)
        return callback(err)

      var data =
        {
          newbalance: 0,/*result["env:Envelope"]["env:Body"][0]
            .billExternalPaymentResponse[0]
            .payload[0]
            .receipt[0]
            .debited[0]
            .newBalance[0],*/
          operationId: result["env:Envelope"]["env:Body"][0]
            .billExternalPaymentResponse[0]
            .payload[0]
            .receipt[0]
            .operationId[0]
        }

      var date = getDate(result);

      if (date != null) {
        data.operationDate = date;
      }

      return callback(null, data)
    });
  },

  parseActorData: function (body, callback) {
    parseString(body, function (err, result) {
      if (err) {
        return callback(err);
      }

      var actorData = result["env:Envelope"]["env:Body"][0]
        .actorGetDetailsResponse[0]
        .payload[0]
        .actor[0];

      return callback(null, actorData);
    });
  }

};

function getReceipt(result) {
  if (typeof result["env:Envelope"]["env:Body"]!="undefined" && result["env:Envelope"]["env:Body"].length > 0
    && typeof result["env:Envelope"]["env:Body"][0].domesticTransferResponse != "undefined" && result["env:Envelope"]["env:Body"][0].domesticTransferResponse.length > 0
    && typeof result["env:Envelope"]["env:Body"][0].domesticTransferResponse[0].payload != "undefined"
    && result["env:Envelope"]["env:Body"][0].domesticTransferResponse[0].payload.length > 0
    && typeof result["env:Envelope"]["env:Body"][0].domesticTransferResponse[0].payload [0].receipt != "undefined"
    && result["env:Envelope"]["env:Body"][0].domesticTransferResponse[0].payload[0].receipt.length > 0) {

      return result["env:Envelope"]["env:Body"][0].domesticTransferResponse[0].payload[0].receipt[0];
  }

  return null;

}


function getDate(result) {
    var receipt = getReceipt(result);

    if (receipt !== null && receipt.date != "undefined" && receipt.date.length > 0) {
        return receipt.date[0];
    }

    return null;
}

function getCreditedBalance(result) {
  var receipt = getReceipt(result);

  if (receipt !== null && receipt.credited != 'undefined' && receipt.credited.length > 0
  && receipt.credited[0].newBalance != 'undefined' && receipt.credited[0].newBalance.length > 0) {
    return receipt.credited[0].newBalance[0];
  }

  return null;
}
