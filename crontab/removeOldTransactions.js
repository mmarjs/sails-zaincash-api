/**
 * Created by yjradeh on 8/11/16.
 */
var soap = require('soap');//Soap Library and XML parser
var moment = require('moment');

module.exports = {
  run: function () {
    sails.log('removeOldTransactions Started at ' + new Date());

    var dataAfter = moment().subtract(1, 'months');
    var criteria = {
      status: {not: "completed"},
      createdAt: {"<": new Date(dataAfter)}
    };

    Transactions.destroy(criteria).exec(function (err) {
      if (err) {
        sails.log('removeOldTransactions cron error' + new Date());
        return {success: false, err: err}
      }
      sails.log('removeOldTransactions cron done ' + new Date());
      return {success: true}
    });

  }
}
