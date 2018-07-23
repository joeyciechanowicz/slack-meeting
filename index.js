const config = require('./config.json');
const googleapis = require('googleapis');
const mysql = require('mysql');
const {start, next, end} = require('./src/bot');

const {connectionName, dbUser, dbPass, dbName, slackToken,} = config;

/*
/meeting start
 - check if meeting already started and show error if so
 - Print out *Meeting starting*
 - add meeting to meetings table
 - post first issue & stick link to discussion on the ticket
 - add first issue to db table of discussed issues
/meeting next
  - next issue & stick link to discussion on the ticket
 - add next issue to db table of discussed issues
/meeting end
 - delete meeting & seen issues

 */


const pool = mysql.createPool({
    connectionLimit: 1,
    socketPath: '/cloudsql/' + connectionName,
    // host: 'localhost',
    user: dbUser,
    password: dbPass,
    database: dbName
});

function verifyWebhook(body) {
    if (!body || body.token !== slackToken) {
        const error = new Error('Invalid credentials');
        error.code = 401;
        throw error;
    }
}

exports.meeting = (req, res) => {
    return Promise.resolve()
        .then(() => {
            if (req.method !== 'POST') {
                const error = new Error('Only POST requests are accepted');
                error.code = 405;
                throw error;
            }

            verifyWebhook(req.body);

            if (req.body.text.indexOf('start') !== -1) {
                return start(req, res, pool);
            } else if (req.body.text.indexOf('next') !== -1) {
                return next(req, res, pool);
            } else if (req.body.text.indexOf('end') !== -1) {
                return end(req, res, pool);
            } else {
                throw new Error(`Invalid command: \`${req.body.text}\``);
            }
        })
        .then(() => {
            res.status(200).end();
        })
        .catch(err => {
            res.json(
                {
                    response_type: 'ephemeral',
                    text: err.message
                }
            );
        });
};

exports.interaction = (req, res) => {
    if (req.body.type !== 'message_action' || req.body.callback_id !== 'reopen' || req.body.attachments.length !== 1) {
        req.status(200).end();
        return;
    }

    console.log(req.body.attachments[0]);


    res.json({
        text: 'Reopened issue'
    });
};
