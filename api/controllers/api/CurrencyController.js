/**
 * ActorController
 *
 * @description :: Server-side logic for managing Transaction
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var soap = require('soap');

module.exports = {

  /**
   * `ActorController.changeLanguage()`
   *
   */
  rate: function (req, res) {
  	CurrenciesConversion.findOne({from: "USD"}).exec(function (err, cur) {
	    if (err || !cur)
	    	return res.json({success: 0, err: "currency_not_supported"})

	    currency = cur
	    return res.json({success: 1, currency: currency})
	    callback(null)
	  })
  }
}

