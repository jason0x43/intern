import Channel from '../lib/WebSocketChannel';
import { getQueryParams, loadScript } from './util';
import Browser, { Config } from '../lib/executors/Browser';

declare let intern: Browser;

export interface ClientParams extends Config {
	debug?: boolean;
	// initialBaseUrl: string;
	loaderScript?: string;
	name: string;
	runInSync?: boolean;
	sessionId: string;
	socketPort?: number;
	suites: string[];
}

const config: Config  = {};
let sessionId: string;
let suites: string[] = [];
let loaderScript: string;
let runInSync: boolean;
let socketPort: number;

// If there's a 'debug' query param, this will be be a function that sends messages over the instantiated Channel
// (below)
let debug = (_data: any) => Promise.resolve();

const params: ClientParams = <any>getQueryParams();

Object.keys(params).forEach((name: keyof ClientParams) => {
	const value = params[name];

	// Filter out parameeters than the executor won't understand
	switch (name) {
		case 'sessionId':
			sessionId = <string>value;
			break;
		case 'suites':
			suites.push(<string>value);
			break;
		case 'debug':
			debug = (data: any) => channel.sendMessage('debug', { data: data });
			break;
		case 'loaderScript':
			loaderScript = <string>value;
			break;
		case 'runInSync':
			runInSync = <boolean>value;
			break;
		case 'socketPort':
			socketPort = Number(value);
			break;
		default:
			config[name] = value;
	}
});

// TODO: ensure the channel is created with the proper URL
const basePath = config.basePath;
const channel = new Channel({ url: basePath, sessionId, port: socketPort });
const sendError = (error: Error) => channel.sendMessage('error', error);

intern.debug = debug;
debug(`Query: ${location.search}`);
debug(`Params: ${JSON.stringify(params)}`);

// The executor should use the same channel we're using here to ensure sequence numbers match up
config.channel = channel;

// Forward all executor events back to the host Intern
intern.on('*', data => {
	debug(data);
	let promise = channel.sendMessage(data.name, data.data).catch(console.error);
	if (runInSync) {
		return promise;
	}
});

try {
	intern.configure(config);
	debug('Configured intern');
	if (loaderScript) {
		debug(`Loading loader script ${loaderScript}`);
		loadScript(loaderScript, basePath);
	}
	else {
		debug(`Loading suites ${JSON.stringify(suites)}`);
		Promise.all(suites.map(suite => {
			loadScript(suite, basePath);
		})).then(() => {
			debug(`Starting intern with ${intern['_rootSuite'].tests.length} tests`);
			return intern.run();
		}).then(() => {
			debug('Finished intern');
		}).catch(sendError);
	}
}
catch (error) {
	sendError(error);
}
