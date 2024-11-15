module.exports = {
    run: function() {
        console.log('Update cronjob reached');
        var filter = {
            status: 'completed',
            operationDate: {$exists: false}
          };

          Transactions.find().where(filter).sort('operationId DESC').exec(function(err, records) {
                if (err) {
                    sails.log.info('Update opreation Date cronjob error: ', err);
                } else {
                    async.each(records, function(r, callback) {
                        r.operationDate = new Date(r.updatedAt);
                        r.save(function (err) {
                            callback();
                        });
                    }, function (err) {
                        if (err) sails.log.info('Final Error reached', err);
                        else sails.log.info('Success');
                    });
                }
          });
    }
}