module.exports = {
    updateTransactions: function (req, res) {
        var filter = {
            status: 'completed',
            operationDate: {$exists: false}
        };

        var params = req.params.all();
        if (typeof params.limit === 'undefined' || typeof params.skip === 'undefined' || !params.order) {
            return res.send('Missing Params');
        } else {
            Transactions.find().where(filter)
            .limit(params.limit)
            .exec(function(err, records) {
                if (err) {
                    sails.log.info('Update opreation Date cronjob error: ', err);
                } else {
                    async.each(records, function(r, callback) {
                        r.operationDate = new Date(r.updatedAt);
                        r.save(function (err) {
                            callback();
                        });
                    }, function (err) {
                        if (err) {
                            sails.log.info('Final Error reached', err);
                            res.send('Failed to update transactions');
                        }
                        else res.send('Transactions updated succesfully');
                    });
                }
          });
        }
    }
}
