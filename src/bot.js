const request = require('request');
const {githubToken, githubClientId, githubClientSecret, columnId} = require('../config.json');

function getMeeting(channel, pool) {
    return new Promise((resolve, reject) => {
        pool.query('SELECT * from meetings where channel_name = ?', [channel], (error, results) => {
            if (error) {
                throw error;
            }

            resolve(results);
        });
    });
}

function getDiscussedCards(meetingId, pool) {
    return new Promise((resolve, reject) => {
        pool.query('SELECT github_id from issues where meeting_id = ? ORDER BY meeting_id ASC', [meetingId], (error, results) => {
            if (error) {
                throw error;
            }

            resolve(results);
        });
    });
}

function addDiscussedCard(meetingId, cardId, pool) {
    return new Promise((resolve, reject) => {
        pool.query('INSERT INTO issues (meeting_id, github_id) VALUE (?, ?)', [meetingId, cardId], (error, results) => {
            if (error) {
                throw error;
            }

            resolve(results);
        });
    });
}

function addMeeting(channelName, pool) {
    return new Promise((resolve, reject) => {
        pool.query('INSERT INTO meetings (channel_name) VALUE (?)', [channelName], (error, results) => {
            if (error) {
                throw error;
            }

            resolve(results);
        });
    });
}

function deleteMeeting(meetingId, pool) {
    return new Promise((resolve, reject) => {
        pool.query('DELETE FROM meetings WHERE meeting_id = ?', [meetingId], (error, results) => {
            if (error) {
                throw error;
            }

            resolve(results);
        });
    });
}

function getGithubCards() {
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
                return reject(response.statusCode);
            }

            const result = JSON.parse(body);
            resolve(result);
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
                return reject(response.statusCode);
            }

            const result = JSON.parse(body);
            resolve(result);
        });
    });
}

function sendResponse(payload, url) {
    return new Promise((resolve, reject) => {
        request.post({
            url: url,
            json: true,
            body: payload
        }, (error, response, body) => {
            if (error) {
                return reject(error);
            } else if (response.statusCode !== 200) {
                return reject('Unexpected response code calling slack: ' + response.statusCode);
            }

            resolve();
        });
    });
}

module.exports.start = function (req, res, pool) {
    return getMeeting(req.body.channel_name, pool)
        .then((meeting) => {
            if (meeting.length > 0) {
                const message = 'A meeting has already been started, use `/meeting end` to finish the previous meeting first';
                throw new Error(message);
            }
        })
        .then(() => Promise.all([
            getGithubCards(),
            addMeeting(req.body.channel_name, pool)
        ]))
        .then(([cards,]) => {
            if (cards.length === 0) {
                const message = ':star: :star: :star: :star: :star: :star: :star: :star: \n' +
                    '        *FE Open Space Started* \n' +
                    ':star: :star: :star: :star: :star: :star: :star: :star:\n\n _No cards currently, please create them now._';

                return sendResponse({
                    text: message,
                    response_type: 'in_channel'
                }, req.body.response_url);
            }

            const message = ':star: :star: :star: :star: :star: :star: :star: :star: \n' +
                '        *FE Open Space Started* \n' +
                `:star: :star: :star: :star: :star: :star: :star: :star:\n\n _We have ${cards.length} card${cards.length > 1 ? 's' : ''} to discuss._`;
            return sendResponse({
                text: message,
                response_type: 'in_channel'
            }, req.body.response_url);
        });
};

module.exports.next = function (req, res, pool) {
    return getMeeting(req.body.channel_name, pool)
        .then((meetings) => {
            if (meetings.length !== 1) {
                const message = 'A meeting has not yet started. Please use `/meeting start`';
                throw new Error(message);
            }
            const meeting = meetings[0];

            return Promise.all([
                getDiscussedCards(meeting.meeting_id, pool),
                getGithubCards()
            ]).then(([dbCards, githubCards]) => {
                if (githubCards.length === 0) {
                    const message = 'No cards to discuss. Please add cards or use `/meeting end` to finish';
                    throw new Error(message);
                }
                const issuesToDisucss = githubCards.filter((githubCard) => dbCards.findIndex((dbCard) => dbCard.github_id === githubCard.id) === -1);
                if (issuesToDisucss.length === 0) {
                    const message = 'All cards have been discussed :party: Use `/meeting end` to finish';
                    res.json({
                        text: message
                    });
                } else {
                    const nextIssue = issuesToDisucss[0];
                    return Promise.all([
                        addDiscussedCard(meeting.meeting_id, nextIssue.id, pool),
                        getGithubCardContent(nextIssue.content_url)
                    ]).then(([, content]) => {
                        return sendResponse({
                            attachments: [
                                {
                                    'fallback': content.title,
                                    'color': '#36a64f',
                                    'author_name': nextIssue.creator.login,
                                    'author_icon': nextIssue.creator.avatar_url,
                                    'title': content.title,
                                    'title_link': content.html_url
                                }
                            ],
                            response_type: 'in_channel'
                        }, req.body.response_url);
                    });
                }
            });
        });
};

module.exports.end = function (req, res, pool) {
    return getMeeting(req.body.channel_name, pool)
        .then((meetings) => {
            if (meetings.length !== 1) {
                const message = 'A meeting has not yet started. Please use `/meeting start`';
                res.json({
                    text: message
                });
                throw new Error(message);
            }
            return meeting = meetings[0];
        }).then(meeting => deleteMeeting(meeting.meeting_id, pool))
        .then(() => {
            const message = ':star: :star: :star: :star: :star: :star: :star: :star: \n' +
                '        *FE Open Space Ended!* \n' +
                `:star: :star: :star: :star: :star: :star: :star: :star:\n\n _Well done everyone_ :smile:`;
            return sendResponse({
                text: message,
                response_type: 'in_channel'
            }, req.body.response_url);
        });
};
