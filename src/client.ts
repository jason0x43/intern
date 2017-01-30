import Channel from './lib/Channel';

function loadSuite(suite: string) {
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.addEventListener('load', resolve);
		script.addEventListener('error', event => {
			console.error(`Error loading ${suite}:`, event);
			reject(new Error('Error loading ' + suite));
		});
		script.src = suite;
		document.body.appendChild(script);
	});
}

const args = location.search.slice(1).split('&').filter(arg => {
	return arg !== '' && arg[0] !== '=';
}).map(arg => {
	const parts = arg.split('=');
	return {
		name: decodeURIComponent(parts[0]),
		// An arg name with no value is treated as having the value 'true'
		value: decodeURIComponent(parts[1]) || true
	};
});

const config: { [name: string]: any } = {};
let sessionId: string;
let suites: string[] = [];

args.filter(({ name, value }) => {
	switch (name) {
		case 'reporter':
			return false;
		case 'sessionId':
			sessionId = <string>value;
			return false;
		case 'suites':
			suites.push(<string>value);
			return false;
		default:
			return true;
	}
}).forEach(({ name, value }) => {
	if (name in config) {
		if (!Array.isArray(config[name])) {
			config[name] = [config[name]];
		}
		config[name].push(value);
	}
	else {
		config[name] = value;
	}
});

const channel = new Channel('/', sessionId);
config['channel'] = channel;
const sendError = (error: Error) => channel.sendMessage('error', error);

try {
	intern.configure(config);
	Promise.all(suites.map(loadSuite)).then(() => {
		intern.run();
	}).catch(sendError);
}
catch (error) {
	sendError(error);
}
