/**
 * MerchantController
 *
 * @description :: Server-side logic for Merchants authentication
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

  /**
   * `MerchantController.create()`
   */
  create: function (req, res) {

    var name = req.param('name');
    var msisdn = req.param('msisdn');
    var currency = req.param('currency');
    var secret = req.param('secret');
    var ignoreDuplication = req.param('ignoreDuplication');
    var payByReference = req.param('pay_by_reference');

    var filter = {
      msisdn: msisdn,
      deleted: false
    };



    Merchants.findOne(filter, function (err, merchant) {

      if (merchant && !ignoreDuplication) {
        return res.status(400).json({
          success: 0,
          err: 'User Already Existed'
        });
      }

      var merchant = {
        name: name,
        msisdn: msisdn,
        secret: secret,
        currency: currency,
        deleted: false,
        pay_by_reference:payByReference
      }
      Merchants.create(merchant).exec(function createCB(err, merchant) {
        if (err) {
          return res.status(400).json({
            success: 0,
            err: 'Cannot adding the merchat'
          });
        }
        res.status(200).send({
          success: 1,
          id: merchant.id,
          name: merchant.name,
          msisdn: merchant.msisdn,
          currency: merchant.currency,
          secret: merchant.secret,
          pay_by_reference:payByReference
        });
      })
    })
  },

  /**
   * `MerchantController.update()`
   */
  update: function (req, res) {

    var id = req.param('id');
    var name = req.param('name');
    var msisdn = req.param('msisdn');
    var currency = req.param('currency');
    var secret = req.param('secret');
    var payByReference = req.param('pay_by_reference');

    Merchants.findOne({
      id: id,
      deleted: false
    }, function (err, merchant) {

      if (!merchant) {
        return res.status(400).json({
          success: 0,
          err: 'User Not Existed'
        });
      }

      merchant.name = name
      merchant.msisdn = msisdn
      merchant.currency = currency
      merchant.secret = secret
      merchant.pay_by_reference=payByReference
      merchant.save(function (err) {
        if (err)
          return res.status(400).json({
            success: 0,
            err: 'Cannot adding the merchat'
          });
        else
          res.status(200).send({
            success: 1,
            id: merchant.id
          });
      })

    })
  },


  /**
   * `MerchantController.delete()`
   */
  delete: function (req, res) {

    var id = req.param('id');

    Merchants.findOne({
      id: id,
      deleted: false
    }, function (err, merchant) {

      if (!merchant) {
        return res.status(400).json({
          success: 0,
          err: 'Merchant Not Existed'
        });
      }

      merchant.deleted = true
      merchant.save(function (err) {
        if (err)
          return res.status(400).json({
            success: 0,
            err: 'Cannot delete the merchant'
          });
        else
          res.status(200).send({
            success: 1
          });
      })
    })
  }
}
