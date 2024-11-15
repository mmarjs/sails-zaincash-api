/**
 * Created by yjradeh on 8/11/16.
 */
var soap = require('soap');//Soap Library and XML parser
var moment = require('moment');
const fs = require('fs');
const lockFile = './sync_lock.txt';

module.exports = {
  run: function () {

    if (fs.existsSync(lockFile)) {
      sails.log.info('already exist syncTransaction job');
      return {success: false, err: 'already exist syncTransaction job'}

    }
    console.log('creating file');
    fs.openSync(lockFile, 'w');
    var files, merchs = [];
    var fileLocation = sails.config.connections.ftpCdrLocation;
    var newFileLocation = "./eserv_finish";

    //add new log
    console.log("sync now happening")
    sails.log.info('syncTransactions Started at ' + new Date());
    async.series([

        function (callback) {
          sails.log.info('here');
          Merchants.find({deleted: false}).exec(function (err, merchants) {
            if (err || !merchants) {
              sails.log.info('inside if');
              sails.log.info('this is the err' + err);
              fs.unlinkSync(lockFile);
              return callback({msg: "error retrieving merchants"})
            }
            sails.log.info('before for loop');
            for (var i = 0; i < merchants.length; i++) {
              merchs[i] = merchants[i].msisdn.toString()
            }
            callback(null)
          })
        },
        function getAllTheFiles(callback) {
          sails.log.info('get All The Files');
          require('fs').readdir(fileLocation, function (err, allTheFiles) {
            sails.log.info(fileLocation);
            if (err) {
              console.log('inside err');
              sails.log.info(err);
              fs.unlinkSync(lockFile);
              return callback({msg: "error retrieving list of the files", isError: false})
            }
            if (allTheFiles.length == 0) {
              sails.log.info('empty files');
              //      fs.unlink(lockFile, (err) => {
              //	 if (err) console.log(err);
              //	 console.log('successfully deleted /tmp/hello');
              //    });
              fs.unlinkSync(lockFile);
              return callback({msg: "empty files", isError: false})
            }
            files = allTheFiles;
            sails.log.info('files');
            sails.log.info(files);
            sails.log('files.find');
            callback(null)
          });
        },
        function (callback) {
          sails.log.info('read files');
          sails.log.info(files);
          const readline = require('readline');
          const fs = require('fs');
          async.eachSeries(files, function (file, esCallback) {
            console.log('started with file of index');
            console.log('Read File: ' + file);
            const rl = readline.createInterface({input: fs.createReadStream(fileLocation + "/" + file)});
            rl.on('line', function (line) {
              transaction = line.split("|");
              sails.log.info("transacrtion " + line);
              //sync the transaction
              syncTrans.addTransaction(transaction, merchs, function (err) {
              })
            });
            rl.on('close', function (line) {
              sails.log.info('close this file ' + file);
              require('fs').renameSync(fileLocation + "/" + file, newFileLocation + "/" + file);
              // The next iteration WON'T START until callback is called
              esCallback();
            });
          }, function () {
            fs.unlinkSync(lockFile);
            console.log('finish Reading file');
            // We're done looping in this function!
          });
        }
      ],
      function (err) {
        if (fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
        }
        if (err) {
          sails.log('syncTransactions Finished with erro at ' + new Date());
          err.msg = err.msg ? err.msg : "unknown_error"
          return {success: false, err: err.msg}
        }
        sails.log('syncTransactions Finished at ' + new Date());
        return {success: true}
      }
    )
  },

}
