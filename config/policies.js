module.exports.policies = {

  '*': ['isAuthorized'], // Everything resctricted here

  TransactionController: {
    '*': true // We dont need authorization here, allowing public access
  },
  'api/UserAuthController': {
    '*': true // We dont need authorization here, allowing public access
  },
  'api/TopUpController': {
    'catalog': true // We dont need authorization here, allowing public access
  },
  'cms/MerchantAuthController': {
    '*': true // We dont need authorization here, allowing public access
  },
  'cms/CurrencyController': {
    '*':  ['isAdmin', 'isAuthorized'] // We dont need authorization here, allowing public access
  },
  'cms/MerchantController': {
    '*':  ['isAdmin', 'isAuthorized'] // We dont need authorization here, allowing public access
  },
  'cms/BankController': {
    '*': ['isAdmin', 'isAuthorized']
  },
  'api/CashInController': {
    'denomination': true // We dont need authorization here, allowing public access
  },
  'api/GeneralController': {
    'updateTransactions': true
  }
};
