const {slackToken} = require('./config.json');
const {meeting, meetingSub} = require('.');

const requestStub = {
	method: 'POST',
	body: {
		
	}
};

const responseStub = {
	json(obj) {
		console.log(obj);
	}
};

// meeting(requestStub, responseStub)
//     .then(x => {
//         process.exit();
//     })
//     .catch(e => {
//         console.error(e);
//         process.exit();
//     });

const data = Buffer.from(JSON.stringify(requestStub.body));

function callback() {
	console.log('callback triggered');
}

meetingSub({data: data}, callback)
	.then(() => {
		console.log('promise complete');
		process.exit();
	})
	.catch((e) => {
		console.error('Error', e);
		process.exit();
	});
