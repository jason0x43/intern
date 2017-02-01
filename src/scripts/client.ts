import Channel from '../lib/WebSocketChannel';
import { loadScript } from './util';

const params = location.search.slice(1).split('&').filter(arg => {
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
let loader: string;
let runInSync: boolean;
let socketPort: number;

// If there's a 'debug' query param, this will be be a function that sends messages over the instantiated Channel
// (below)
let debug = (_data: any) => Promise.resolve();

params.filter(({ name, value }) => {
	// Filter out parameeters than the executor won't understand
	switch (name) {
		case 'reporter':
			break;
		case 'sessionId':
			sessionId = <string>value;
			break;
		case 'suites':
			suites.push(<string>value);
			break;
		case 'debug':
			debug = (data: any) => channel.sendMessage('debug', { data: data });
			break;
		case 'loader':
			loader = <string>value;
			break;
		case 'runInSync':
			runInSync = <boolean>value;
			break;
		case 'socketPort':
			socketPort = Number(value);
			break;
		default:
			return true;
	}

	return false;
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

// TODO: ensure the channel is created with the proper URL
const basePath = config['basePath'];
const channel = new Channel({ url: basePath, sessionId, port: socketPort });
const sendError = (error: Error) => channel.sendMessage('error', error);

// The executor should use the same channel we're using here to ensure sequence numbers match up
config['channel'] = channel;

// Forward all executor events back to the host Intern
intern.on('*', data => {
	debug(data);
	let promise = channel.sendMessage(data.name, data.data).catch(console.error);
	if (runInSync) {
		return promise;
	}
});

(<any>window)['channel'] = channel;

debug(suites);

try {
	intern.configure(config);
	debug('configured intern');
	if (loader) {
		loadScript(loader, basePath);
	}
	else {
		loadScript('node_modules/dojo-loader/loader.js', basePath).then(() => {
			const loader = (<any>window).require;
			loader.config({
				packages: [
					{ name: 'chai', location: '../../node_modules/chai', main: 'chai' }
				]
			});
			return loader(suites, () => {
				debug(`starting intern with ${intern['_rootSuite'].tests.length} tests`);
				intern.run().then(() => {
					debug('finished intern');
				});
			});
		}).catch(sendError);
	}
}
catch (error) {
	sendError(error);
}
