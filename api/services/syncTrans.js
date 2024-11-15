
function validatePhoneNumber(phoneNumber) {
  if (phoneNumber.length < 10  || phoneNumber.length > 13  ) {
    return false;
  } else if (phoneNumber.substring(0,3) == 964) {
    //do nothing
  } else if (phoneNumber.substring(0,2) == "07") {
    phoneNumber = 964 + phoneNumber.substring(1)
  } else if (phoneNumber.substring(0,1) == "7") {
    phoneNumber = 964 + phoneNumber
  } else {
    return false;
  }
  return phoneNumber;
}

// Generates a token from supplied payload
module.exports.addTransaction = function (transaction, merchs, callback) {

  var debited = transaction[31]
  var credited = transaction[34]

  if (credited===''){credited='0';}
  if (debited===''){debited='0';}

  sails.log.info("debited "+debited);
  sails.log.info("credited"+credited);
  sails.log.info("transaction ",transaction);

  if (transaction[5] != "SUCCESS"
    // || transaction[4] != "USSD"
    // || transaction[2] == "MERCHANT_PAYMENT"
    || (merchs.indexOf(debited) < 0 && merchs.indexOf(credited) < 0)
  ) {
    sails.log.info("invlaid transaction ")
    return callback(null)
  }
  Transactions.findOne({operationId: transaction[1]}).exec(function (err, trans) {
    //if error
    if (err) {
      sails.log.info("exits")
      return callback(null)
    }
    //if exists with failed status, then update. 
    if (trans) {
      if(trans.status!='completed'){
        Transactions.update({operationId: transaction[1]},{status:'completed'}).exec(function (err) {
          sails.log.info("error in updating "+err);
        })
      }
      return callback(null)
    }

    sails.log.info("will add transaction now")
    var data = {
      token: "0",
      source: "sync",
      type: transaction[2],
      serviceType: "0",
      amount: Math.abs(transaction[6].slice(0, -5))?Math.abs(transaction[6].slice(0, -5)):Math.abs(transaction[6]),
      credit: merchs.indexOf(debited) ? true : false,
      from: debited,
      operationId: transaction[1],
      status: "completed",
      transfer_to: credited,
      updatedAt: new Date(transaction[0].replace(":"," ")),
      operationDate: new Date(transaction[0].replace(":"," ")),
      comment: transaction[27],
      totalFees: parseInt(parseInt(transaction[7]) / 100000 + parseInt(transaction[8]) / 100000 + parseInt(transaction[9]) / 100000)
    }
    Transactions.create(data).exec(function createCB(err, created) {
	sails.log.info("err "+err);
        sails.log.info("created "+created);
      return callback(null)
    })

  })
};
