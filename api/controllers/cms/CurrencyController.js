/**
 * CurrencyController
 *
 * @description :: Server-side logic for Merchants authentication
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var soap = require('soap');//Soap Library and XML parser

module.exports = {

  /**
   * `CurrencyController.update()`
   *
   * update currency rate
   */
  updateRate: function (req, res) {

    //IF not admin ignore it
    var params = req.params.all()
    var rate = params.newRate
    var currency

    if (!rate)
      return res.json({success: 0, err: "invalid_rate"})

    async.waterfall([
        function findCurrency(callback) {
          CurrenciesConversion.findOne({from: "USD"}).exec(function (err, cur) {
            if (err || !cur)
              return callback({msg: "currency_not_supported"})

            currency = cur
            callback(null)
          })
        },
        function addCurrenciesConversionHistory(callback) {
          var data = {
            from: currency.from,
            to: currency.to,
            rate: currency.rate,
            date: currency.updatedAt
          }
          CurrenciesConversionHistory.create(data).exec(function createCB(err, obj) {
            if (err)
              return callback({msg: "error_saving_history_for_new_currency"})

            callback(null)
          })
        },
        function updateRate(callback) {
          currency.rate = rate
          currency.save(function (err) {
            if (err)
              return callback({msg: "error_updating_the_new_currency"})
            callback(null)
          })
        }
      ],
      function (err) {
        if (err)
          return res.json({success: 0, err: err.msg})

        return res.json({
          success: 1,
          currency: currency,
        })
      })
  },
}

