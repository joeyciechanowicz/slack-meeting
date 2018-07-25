const config = require('./config.json');
const mysql = require('mysql');
const PubSub = require('@google-cloud/pubsub');
const request = require('request');
const {start, next, end, abort, sendMessage} = require('./src/bot');

const {connectionName, dbUser, dbPass, dbName, slackToken, slackClientId, slackClientSecret} = config;

const pubsub = new PubSub();

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

function run(slackMessage) {
	if (slackMessage.text.indexOf('start') !== -1) {
		return start(slackMessage, pool);
	} else if (slackMessage.text.indexOf('next') !== -1) {
		return next(slackMessage, pool);
	} else if (slackMessage.text.indexOf('end') !== -1) {
		return end(slackMessage, pool);
	} else if (slackMessage.text.indexOf('abort') !== -1) {
		return abort(slackMessage, pool);
	} else {
		throw Promise.reject(`Invalid command: ${slackMessage.text}`);
	}
}

function getToken(teamId) {
	return new Promise((resolve, reject) => {
		pool.query('SELECT * from auth_tokens where team_id = ?', [teamId], (error, results) => {
			if (error) {
				throw error;
			}

			resolve(results);
		});
	});
}

function saveToken(teamId, token) {
	return new Promise((resolve, reject) => {
		pool.query('INSERT INTO auth_tokens (team_id, token) VALUE (?, ?)', [teamId, token], (error, results) => {
			if (error) {
				throw error;
			}

			resolve(results);
		});
	});
}

exports.meetingSub = (event) => {
	const pubsubMessage = event.data;

	const slackMessage = JSON.parse(Buffer.from(pubsubMessage, 'base64').toString());

	return run(slackMessage)
		.catch(e => {
			console.error(e);
		});
};

exports.meeting = (req, res) => {
	if (req.method !== 'POST') {
		const error = new Error('Only POST requests are accepted');
		error.code = 405;
		throw error;
	}

	verifyWebhook(req.body);

	if (req.body.text.match(/start|next|end|abort/) !== null) {
		const topic = pubsub.topic('MEETING_MESSAGES');
		const publisher = topic.publisher();

		const data = Buffer.from(JSON.stringify(req.body));

		return publisher.publish(data)
			.then(() => res.status(200).end())
			.catch((err) => {
				console.error(err);
				res.json({
					response_type: 'ephemeral',
					text: `Unhandled error: \`${JSON.stringify(err)}\``
				});
				return Promise.reject(err);
			});
	} else {
		res.json(
			{
				response_type: 'ephemeral',
				text: `Invalid command: \`${req.body.text}\``
			}
		);
	}
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

exports.authRedirect = (req, res) => {
	const options = {
		uri: 'https://slack.com/api/oauth.access?code='
		+ req.query.code +
		'&client_id=' + slackClientId +
		'&client_secret=' + slackClientSecret,
		method: 'GET'
	};

	request(options, (error, response, body) => {
		const JSONresponse = JSON.parse(body)
		if (!JSONresponse.ok) {
			res.send('Error encountered: \n' + JSON.stringify(JSONresponse)).status(200).end()
		} else {
			saveToken(JSONresponse.team_id, JSONresponse.access_token)
				.then(() => {
					res.send('Success!');
				});
		}
	})
};