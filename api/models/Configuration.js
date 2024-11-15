/**
 * Configuration.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {

  attributes: {
    key: {
      type: 'string',
      required: true,
      unique: true,
      primaryKey: true,
    },
    value: {
      type: 'json',
      required: true
    }
  },
  getIntValue: function (key, callback) {

    Configuration.findOne({key: key}).exec(function (err, conf) {
      if (err) return callback(err);
      if (!conf) return callback(new Error('conf not found.'));
      return callback(null, parseInt(conf.value.value));
    });
  }
};
