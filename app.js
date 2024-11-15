/**
 * app.js
 *
 * Use `app.js` to run your app without `sails lift`.
 * To start the server, run: `node app.js`.
 *
 * This is handy in situations where the sails CLI is not relevant or useful.
 *
 * For example:
 *   => `node app.js`
 *   => `forever start app.js`
 *   => `node debug app.js`
 *   => `modulus deploy`
 *   => `heroku scale`
 *
 *
 * The same command-line arguments are supported, e.g.:
 * `node app.js --silent --port=80 --prod`
 */

// Ensure we're in the project directory, so relative paths work as expected
// no matter where we actually lift from.
process.chdir(__dirname);

// Ensure a "sails" can be located:
(function () {
  var sails;
  try {
    pm2 = require('pm2');
    pm2.connect(function (err) {
      if (err) {
        console.error(err);
        process.exit(2);
      }
      console.log("connected to pm2")
      pm2.launchBus(function (err, bus) {
        sails.log.info('bus : ' + JSON.stringify(bus));
        if (err) {
          sails.log.info('failed to establish bus connection');
          sails.log.info(JSON.stringify(err));
        }
        bus.on('log:err', function (e) {
          // Send emails
          sails.log.info(JSON.stringify(e));
          try {
            mailer.send('Node js Alert System', e.data);
          } catch (e) {
            sails.log.info('failed to send alert email');
          }

        });

      });
    });
    sails = require('sails');
  } catch (e) {
    console.error('To run an app using `node app.js`, you usually need to have a version of `sails` installed in the same directory as your app.');
    console.error('To do that, run `npm install sails`');
    console.error('');
    console.error('Alternatively, if you have sails installed globally (i.e. you did `npm install -g sails`), you can use `sails lift`.');
    console.error('When you run `sails lift`, your app will still use a local `./node_modules/sails` dependency if it exists,');
    console.error('but if it doesn\'t, the app will run with the global sails instead!');
    return;
  }

  // Try to get `rc` dependency
  var rc;
  try {
    rc = require('rc');
  } catch (e0) {
    try {
      rc = require('sails/node_modules/rc');
    } catch (e1) {
      console.error('Could not find dependency: `rc`.');
      console.error('Your `.sailsrc` file(s) will be ignored.');
      console.error('To resolve this, run:');
      console.error('npm install rc --save');
      rc = function () {
        return {};
      };
    }
  }


  // Start server
  sails.lift(rc('sails'));
})();
