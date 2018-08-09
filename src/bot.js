const request = require('request');
const {githubToken, githubClientId, githubClientSecret, toDiscussColumn, needsUpdateColumn, slackOAuthToken} = require('../config.json');

function getMeeting(channel, pool) {
	return new Promise((resolve, reject) => {
		pool.query('SELECT * from meetings where channel_name = ?', [channel], (error, results) => {
			if (error) {
				reject(error);
			}

			resolve(results);
		});
	});
}

function getDiscussedCards(meetingId, pool) {
	return new Promise((resolve, reject) => {
		pool.query('SELECT github_id from issues where meeting_id = ? ORDER BY meeting_id ASC', [meetingId], (error, results) => {
			if (error) {
				reject(error);
			}

			resolve(results);
		});
	});
}

function addDiscussedCard(meetingId, cardId, pool) {
	return new Promise((resolve, reject) => {
		pool.query('INSERT INTO issues (meeting_id, github_id) VALUE (?, ?)', [meetingId, cardId], (error, results) => {
			if (error) {
				reject(error);
			}

			resolve(results);
		});
	});
}

function addMeeting(channelName, pool) {
	return new Promise((resolve, reject) => {
		pool.query('INSERT INTO meetings (channel_name) VALUE (?)', [channelName], (error, results) => {
			if (error) {
				reject(error);
			}

			resolve(results);
		});
	});
}

function deleteMeeting(meetingId, pool) {
	return new Promise((resolve, reject) => {
		pool.query('DELETE FROM meetings WHERE meeting_id = ?', [meetingId], (error, results) => {
			if (error) {
				reject(error);
			}

			resolve(results);
		});
	});
}

function getGithubCardsForColumn(columnId) {
	return new Promise((resolve, reject) => {
		request({
			url: `https://api.github.com/projects/columns/${columnId}/cards`,
			headers: {
				Accept: 'application/vnd.github.inertia-preview+json',
				'User-Agent': 'slack-meeting'
			},
			auth: {
				username: 'joeyciechanowicz',
				password: githubToken
			}
		}, (error, response, body) => {
			if (error) {
				return reject(error);
			} else if (response.statusCode !== 200) {
				return reject(`getGithubCards returned ${response.statusCode}`);
			}

			const result = JSON.parse(body);
			resolve(result);
		});
	});
}

function getGithubCards() {
	return Promise.all([toDiscussColumn, needsUpdateColumn].map(id => getGithubCardsForColumn(id)));
}

function getArchiveLink(slackMessage, ts) {
	return new Promise((resolve, reject) => {
		request.post({
			url: `https://slack.com/api/chat.getPermalink`,
			json: true,
			headers: {
				'Authorization': `Bearer ${slackOAuthToken}`
			},
			form: {
				channel: slackMessage.channel_id,
				message_ts: ts
			}
		}, (error, response, responseBody) => {
			if (error) {
				reject(error);
				return;
			} else if (!responseBody.ok) {
				reject(responseBody.error);
				return;
			}

			resolve(responseBody.permalink);
		});
	});
}

function postCommentOnIssue(slackMessage, issueContent, ts) {
	return getArchiveLink(slackMessage, ts)
		.then(permalink => {

			const requestBody = {
				body: `Discussed on ${(new Date()).toDateString()}\n${permalink}`
			};

			return new Promise((resolve, reject) => {
				request.post({
					url: `https://api.github.com/repos/springernature/frontend-open-space/issues/${issueContent.number}/comments`,
					json: true,
					body: requestBody,
					headers: {
						Accept: 'application/vnd.github.inertia-preview+json',
						'User-Agent': 'slack-meeting'
					},
					auth: {
						username: 'joeyciechanowicz',
						password: githubToken
					}
				}, (error, response, responseBody) => {
					if (error) {
						reject(error);
						return;
					} else if (response.statusCode !== 201) {
						reject(`Error posting comment: ${response.statusCode}`);
						return;
					}

					resolve(responseBody);
				});
			});
		});
}

function getGithubCardContent(cardUrl) {
	return new Promise((resolve, reject) => {
		request({
			url: cardUrl,
			headers: {
				Accept: 'application/vnd.github.inertia-preview+json',
				'User-Agent': 'slack-meeting'
			},
			auth: {
				username: 'joeyciechanowicz',
				password: githubToken
			}
		}, (error, response, body) => {
			if (error) {
				return reject(error);
			} else if (response.statusCode !== 200) {
				return reject(`getGithubCards returned ${response.statusCode}`);
			}

			const result = JSON.parse(body);
			resolve(result);
		});
	});
}

function sendMessage(slackMessage, payload, isEphemeral = false) {
	const requestBody = {
		...payload,
		channel: slackMessage.channel_id
	};

	if (isEphemeral) {
		requestBody.user = slackMessage.user_id;
	}

	return new Promise((resolve, reject) => {
		request.post({
			url: isEphemeral ? 'https://slack.com/api/chat.postEphemeral' : 'https://slack.com/api/chat.postMessage',
			json: true,
			body: requestBody,
			headers: {
				'Content-type': 'application/json',
				'Authorization': `Bearer ${slackOAuthToken}`
			}
		}, (error, response, responseBody) => {
			// console.log({
			// 	body: requestBody,
			// 	error: error,
			// 	statusCode: response.statusCode,
			// 	responseBody: responseBody,
			// 	slackMessage: slackMessage
			// });

			if (error) {
				reject(error);
				return;
			} else if (!responseBody.ok) {
				reject(responseBody.error);
				return;
			}

			resolve(responseBody);
		});
	});
}

function postIssue(slackMessage, meeting, nextIssue, pool, requiresUpdateMessage) {
	return Promise.all([
		addDiscussedCard(meeting.meeting_id, nextIssue.id, pool),
		getGithubCardContent(nextIssue.content_url)
	]).then(([, content]) => sendMessage(slackMessage, {
			attachments: [
				{
					'fallback': content.title,
					'color': requiresUpdateMessage ? '#3648a6' : '#36a64f',
					'author_name': nextIssue.creator.login,
					'author_icon': nextIssue.creator.avatar_url,
					'title': content.title,
					'title_link': content.html_url,
					'text': requiresUpdateMessage ? 'This issue requires an update' : ''
				}
			]
		}).then((res) => {
			return Promise.all([sendMessage(slackMessage, {
				text: 'Discuss here',
				thread_ts: res.ts
			}), postCommentOnIssue(slackMessage, content, res.ts)]);
		})
	);
}

module.exports.sendMessage = sendMessage;

module.exports.start = function (slackMessage, pool) {
	return getMeeting(slackMessage.channel_name, pool)
		.then((meeting) => {
			if (meeting.length > 0) {
				const message = 'A meeting has already been started, use `/meeting end` to finish the previous meeting first';
				return Promise.reject(message);
			}
		})
		.then(() => Promise.all([
			getGithubCards(),
			addMeeting(slackMessage.channel_name, pool)
		]))
		.then(([cards,]) => {
			if (cards[0].length === 0 && cards[1].length === 0) {
				const message = ':star: :star: :star: :star: :star: :star: :star: :star: \n' +
					'        *FE Open Space Started* \n' +
					':star: :star: :star: :star: :star: :star: :star: :star:\n\n _No cards currently, please create or move them now._';

				return sendMessage(slackMessage, {text: message});
			}

			const message = ':star: :star: :star: :star: :star: :star: :star: :star: \n' +
				'        *FE Open Space Started* \n' +
				`:star: :star: :star: :star: :star: :star: :star: :star:\n\n _We have ${cards[0].length} card${cards[0].length > 1 ? 's' : ''} to discuss, and ${cards[1].length} card${cards[1].length > 1 ? 's' : ''}_ needing an update`;
			return sendMessage(slackMessage, {text: message});
		}).catch(e => {
			return sendMessage(slackMessage, {text: e}, true);
		});
};

module.exports.next = function (slackMessage, pool) {
	return getMeeting(slackMessage.channel_name, pool)
		.then((meetings) => {
			if (meetings.length !== 1) {
				const message = 'A meeting has not yet started. Please use `/meeting start`';
				return Promise.reject(message);
			}
			const meeting = meetings[0];

			return Promise.all([
				getDiscussedCards(meeting.meeting_id, pool),
				getGithubCards()
			]).then(([dbCards, githubCards]) => {
				if (githubCards[0].length === 0 && githubCards[1].length === 0) {
					const message = 'No cards to discuss. Please add cards or use `/meeting end` to finish';
					return Promise.reject(message);
				}

				const issuesToDisucss = githubCards[0].filter((githubCard) => dbCards.findIndex((dbCard) => dbCard.github_id === githubCard.id) === -1);
				const issuesToUpdate = githubCards[1].filter((githubCard) => dbCards.findIndex((dbCard) => dbCard.github_id === githubCard.id) === -1);

				if (issuesToDisucss.length === 0) {
					if (issuesToUpdate.length === 0) {
						const message = 'All cards have been discussed :party: Use `/meeting end` to finish';
						return sendMessage(slackMessage, {text: message}, true);
					}

					const nextIssue = issuesToUpdate[0];
					return postIssue(slackMessage, meeting, nextIssue, pool, true);
				} else {
					const nextIssue = issuesToDisucss[0];
					return postIssue(slackMessage, meeting, nextIssue, pool, false);
				}
			});
		})
		.catch(e => {
			return sendMessage(slackMessage, {text: e}, true);
		});
};

module.exports.end = function (slackMessage, pool) {
	return getMeeting(slackMessage.channel_name, pool)
		.then((meetings) => {
			if (meetings.length !== 1) {
				const message = 'A meeting has not yet started. Please use `/meeting start`';
				return Promise.reject(message);
			}
			return meeting = meetings[0];
		}).then(meeting => deleteMeeting(meeting.meeting_id, pool))
		.then(() => {
			const message = ':star: :star: :star: :star: :star: :star: :star: :star: \n' +
				'        *FE Open Space Ended!* \n' +
				`:star: :star: :star: :star: :star: :star: :star: :star:\n\n _Well done everyone_ :smile:`;
			return sendMessage(slackMessage, {text: message});
		})
		.catch(e => {
			return sendMessage(slackMessage, {text: e}, true);
		});
};

module.exports.abort = function (slackMessage, pool) {
	return getMeeting(slackMessage.channel_name, pool)
		.then((meetings) => {
			if (meetings.length !== 1) {
				const message = 'A meeting has not yet started. Please use `/meeting start`';
				throw new Error(message);
			}
			return meeting = meetings[0];
		}).then(meeting => deleteMeeting(meeting.meeting_id, pool))
		.then(() => {
			const message = 'Meeting ended';
			return sendMessage(slackMessage, {text: message}, true);
		});
};