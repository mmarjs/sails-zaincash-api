/**
 * Banks.js
 *
 * @description :: This model will be used for the bank records 
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
         linked_card: {
            type: 'boolean',
            defaultsTo: false
         },
         linked_account: {
            type: 'boolean',
            defaultsTo: false,
         },
         card_payment_fixed_fee: {
            type: 'float',
            min: 0
         },
         card_payment_percentage_fee: {
             type: 'float',
             min: 0
         },
         card_commission_fixed_fee: {
            type: 'float',
            min: 0
         },
         card_commission_percentage_fee: {
            type: 'float',
            min: 0
         },
         account_payment_fixed_fee: {
            type: 'float',
            min: 0
         },
         account_payment_percentage_fee: {
             type: 'float',
             min: 0
         },
         account_commission_fixed_fee: {
            type: 'float',
            min: 0
         },
         account_commission_percentage_fee: {
            type: 'float',
            min: 0
         },
         deleted: {
             type: 'boolean',
             defaultsTo: false
         }
     }
 };