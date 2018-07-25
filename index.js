const config = require('./config.json');
const mysql = require('mysql');
const PubSub = require('@google-cloud/pubsub');
const {start, next, end, abort, sendResponse} = require('./src/bot');

const {connectionName, dbUser, dbPass, dbName, slackToken} = config;

const pubsub = new PubSub();

let pool;

function verifyWebhook(body) {
	if (!body || body.token !== slackToken) {
		const error = new Error('Invalid credentials');
		error.code = 401;
		throw error;
	}
}

function run(slackMessage) {
	if (!pool) {
		pool = mysql.createPool({
			connectionLimit: 1,
			socketPath: '/cloudsql/' + connectionName,
			// host: 'localhost',
			user: dbUser,
			password: dbPass,
			database: dbName
		});
	}

	if (slackMessage.text.indexOf('start') !== -1) {
		return start(slackMessage, pool);
	} else if (slackMessage.text.text.indexOf('next') !== -1) {
		return next(slackMessage, pool);
	} else if (slackMessage.text.text.indexOf('end') !== -1) {
		return end(slackMessage, pool);
	} else if (slackMessage.text.text.indexOf('abort') !== -1) {
		return abort(slackMessage, pool);
	} else {
		throw Promise.reject(`Invalid command: ${slackMessage.text}`);
	}
}

exports.meetingSub = (event, callback) => {
	const pubsubMessage = event.data;

	// We're just going to log the message to prove that it worked!
	const slackMessage = JSON.parse(Buffer.from(pubsubMessage.data, 'base64').toString());

	return run(slackMessage)
		.then(() => callback())
		.catch(e => {
			if (slackMessage.response_url) {
				sendResponse({
						message: e.message,
						response_type: 'ephemeral'
					}, slackMessage.response_url
				).then(() => callback())
					.catch((e2) => {
						console.error(e2);
						callback();
					});
			} else {
				callback();
			}

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