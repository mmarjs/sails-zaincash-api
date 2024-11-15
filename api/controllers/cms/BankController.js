/**
 * Bank Controller
 *
 * @description :: Server-side logic for adding, editing and deleting a bank
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var errorMessage;

module.exports = {
    /**
     * Create new Bank in Mongo DB database
     */
    create: function (req, res) {
        var params = req.params.all();
        var keys = ['name', 'msisdn', 'linked_card', 'linked_account'];

        if (validateKeys(params, keys) === false) {
            return res.json(401, { success: 0, err: errorMessage });
        }

        if (validateCardLimits(params, keys) === false) {
            return res.json(401, { success: 0, err: errorMessage });
        }

        var filter = {
            msisdn: params.msisdn,
            deleted: false
        };

        Banks.findOne(filter, function (err, bank) {
            if (bank) {
                return res.json(400, { success: 0, err: 'bank_already_exists'});
            }

            var newBank = {};
            buildBankParams(params, newBank);
            newBank.msisdn = parseInt(params.msisdn);

            Banks.create(newBank).exec(function (err, newBank) {
                if (err) {
                    sails.log.error('Error Creating Bank', err);
                    return res.json(400, { success: 0, err: 'error_creating_bank'});
                }

                res.status(200).send({
                    successs: 1,
                    id: newBank.id
                });
            });

        });

    },

    /**
     * Update Bank Data
     */
    update: function (req, res) {
        var params = req.params.all();
        var keys = ['id', 'name', 'linked_card', 'linked_account'];

        if (validateKeys(params, keys) == false) {
            return res.json(401, { success: 0, err: errorMessage });
        }

        if (validateCardLimits(params) === false) {
            return res.json(401, {success: 0, err: errorMessage });
        }

        Banks.findOne({
            id: params.id,
            deleted: false
        }, function (err, bank) {
            if (!bank) {
                return res.json(400, { success: 0, err: 'bank_not_found' });
            }
            buildBankParams(params, bank);

            bank.save(function (err) {
                if (err) {
                    sails.log.error('Error Updating Bank', err);
                    return res.json(400, { success: 0, err: 'error_updating_bank' })
                }

                res.status(200).send({
                    success: 1,
                    id: bank.id
                });
            });

        });
    },

    /**
     * Delete Bank
     */
    delete: function (req, res) {
        var params = req.params.all();
        var keys = ['id'];

        if (validateKeys(params, keys) === false) {
            return res.json(401, { success: 0, err: errorMessage });
        }

        Banks.findOne({
            id: params.id,
            deleted: false
        }, function (err, bank) {
            if (!bank) {
                return res.json(400, { success: 0 , err: 'bank_not_found' });
            }

            bank.deleted = true;

            bank.save(function (err) {
                if (err) {
                    sails.log.error('Error deleting bank', err);
                    return res.json(400, { success: 0, err: 'error_deleting_bank' });
                }

                res.status(200).send({ success: 1, id: params.id });
            });
        });
    }
}

/**
 * Build Bank Prams that will be added or updated in the database
 *
 * @param {object} params
 *
 * @returns {object}
 */
function buildBankParams(params, bank) {

    bank.name   = params.name;
    bank.linked_card = params.linked_card == 1 ? true : false;
    bank.linked_account = params.linked_account == 1 ? true : false;

    bank.card_payment_fixed_fee = bank.linked_card?parseFloat(params.card_payment_fixed_fee):0;
    bank.card_payment_percentage_fee = bank.linked_card?parseFloat(params.card_payment_percentage_fee):0;
    bank.card_commission_fixed_fee = bank.linked_card?parseFloat(params.card_commission_fixed_fee):0;
    bank.card_commission_percentage_fee = bank.linked_card?parseFloat(params.card_commission_percentage_fee):0;

    bank.account_payment_fixed_fee = bank.linked_account?parseFloat(params.account_payment_fixed_fee):0;
    bank.account_payment_percentage_fee = bank.linked_account?parseFloat(params.account_payment_percentage_fee):0;
    bank.account_commission_fixed_fee = bank.linked_account?parseFloat(params.account_commission_fixed_fee):0;
    bank.account_commission_percentage_fee = bank.linked_account?parseFloat(params.account_commission_percentage_fee):0;
}

/**
 * Check if the param object conrains the following keys
 *
 *
 * @param {object} params
 * @param {array} keys
 *
 * @returns {boolean}
 */
function validateKeys(params, keys) {
    for (var i = 0; i < keys.length; i++) {
        if (!(keys[i] in params) || params[keys[i]] == null) {
            errorMessage = keys[i] + '_is_required';
            return false;
        }
    }
    return true;
}

/**
 * Check if all the params related to the card limits exist
 *
 * @param {object} params
 *
 * @returns {boolean}
 */
function validateCardLimits(params) {
    var keys = [];

    // In case the bank has linked card enabled, set the keys that are related to the card and that should be validated
    if (params.linked_card == 1) {
        var cardKeys = [
            'card_payment_fixed_fee', 'card_payment_percentage_fee',
            'card_commission_fixed_fee', 'card_commission_percentage_fee'
        ]

        keys = keys.concat(cardKeys);
    }

    // In case the bank has account enabled, set the keys that are ralated to the account and that should be validated
    if (params.linked_account == 1) {
        var accountKeys = [
            'account_payment_fixed_fee', 'account_payment_percentage_fee',
            'account_commission_fixed_fee', 'account_commission_percentage_fee'
        ];

        keys = keys.concat(accountKeys);
    }

    // check if all the necessary keys exist
    if (validateKeys(params, keys) === false) {
        return false;
    }

    return true;
}
