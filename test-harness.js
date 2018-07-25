const {slackToken} = require('./config.json');
const {meeting} = require('.');

const requestStub = {
    method: 'POST',
    body: {
        token: 'n8EgqXv7JLuijvrMhOCwYXNJ',
        team_id: '',
        team_domain: '',
        channel_id: '',
        channel_name: 'meeting-test',
        user_id: '',
        user_name: '',
        command: '/meeting',
        text: 'start',
        response_url: '',
        trigger_id: ''
    }
};

const responseStub = {
    json(obj) {
        console.log(obj);
    }
};

meeting(requestStub, responseStub)
    .then(x => {
        process.exit();
    })
    .catch(e => {
        console.error(e);
        process.exit();
    });
