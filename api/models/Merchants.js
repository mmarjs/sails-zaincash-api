/**
 * Merchants.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */


module.exports = {

  attributes: {
    msisdn: {
      type: 'integer',
      required: true
    },
    name: {
      type: 'string',
      required: true
    },
    secret: {
      type: 'string',
      required: true
    },
    currency: {
      type: 'string',
      required: true
    },
    deleted: {
      type: 'boolean',
      defaultsTo: false
    },
    // Override the default toJSON method
    toJSON: function () {
      var obj = this.toObject();
      delete obj.secret
      return obj;
    }
  }
};


