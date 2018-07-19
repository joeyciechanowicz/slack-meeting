const config = require('./config.json');
const googleapis = require('googleapis');
const mysql = require('mysql');

const {connectionName, dbUser, dbPass, dbName, slackToken,} = config;

const pool = mysql.createPool({
    connectionLimit: 1,
    // socketPath: '/cloudsql/' + connectionName,
    host: 'localhost',
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

            pool.query('SELECT * from meetings', (error, results, fields) => {
                res.json({error, results});
            });
        });
};
