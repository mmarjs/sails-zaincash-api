/**
 * Transactions.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {

  attributes: {
    token: {
      type: 'string',
      required: true
    },
    source: {type: 'string'},
    type: {type: 'string'},
    amount: {
      type: 'string',
      required: true,
      amountValueMinimum: true
    },
    credit: {
      type: 'boolean',
      defaultsTo: false
    },
    status: {
      type: 'string',
      defaultsTo: "pending"
    },
    //From is the requester or the sender of any request
    from: {
      type: 'string'
    },
    /////////to used to save the merchant ID in case of merchant payment from mobile or web or onecard
    to: {
      model: 'Merchants',
      requiredTo: true
    },
    //in case it not a merchant payment request, transfer to mean for who I am sending the transfer money or cash or topup (receiver)
    transfer_to: {
      type: 'string',
      requiredTransferTo: true
    },
    parent: {
      model: 'Transactions',
    },
    due: {
      type: 'string'
    },
    serviceType: {
      type: 'string',
      required: true
    },
    lang: {type: 'string'},
    orderId: {type: 'string'},
    redirectUrl: {type: 'string'},
    operationId: {type: 'string'},
    newBalance: {type: 'string'},
    creditedNewBalance: {type: 'string'},
    sofId: {type: 'integer'},
    sofOwnerId: {type: 'integer'},
    opt: {type: 'integer'},
    currencyConversion: {type: 'json'},
    product: {type: 'json'},
    agent: {type: 'json'},
    onecard: {type: 'json'},
    comment: {type: 'string'},
    reversed: {
      type: 'boolean',
      defaultsTo: false
    },
    itemId: {type: 'integer'},
    operationDate: { type: 'datetime'},
    // Override the default toJSON method
    toJSON: function () {
      var obj = this.toObject();
      delete obj.token
      delete obj.sofId
      delete obj.otp
      obj.updatedAt = typeof obj.operationDate == 'undefined' ? obj.updatedAt : obj.operationDate;
      return obj;
    }
  },
  types: {
    amountValueMinimum: function (value) {
      return value >= 250;
    },
    requiredTo: function (to) {
      return (!this.transfer_to && !to) ? false : true;
    },
    requiredTransferTo: function (transferTo) {
      return (!this.to && !transferTo) ? false : true;
    }
  }
}
