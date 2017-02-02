import { getQueryParams, loadScript } from './scripts/util';
import Remote, { Config } from './lib/executors/Remote';
import initialize from './intern';
import Channel from './lib/WebSocketChannel';

initialize(Remote);

declare let intern: Remote;

export interface RemoteParams extends Config {
	debug?: boolean;
	// initialBaseUrl: string;
	loaderScript?: string;
	name: string;
	runInSync?: boolean;
	sessionId: string;
	socketPort?: number;
	suites: string[];
}

const config = <Config>{};
let suites: string[] = [];
let loaderScript: string;
let runInSync: boolean;
let socketPort: number;

const params: RemoteParams = <any>getQueryParams();

Object.keys(params).forEach((name: keyof RemoteParams) => {
	const value = params[name];

	// Filter out parameeters than the executor won't understand
	switch (name) {
		case 'suites':
			suites.push(<string>value);
			break;
		case 'loaderScript':
			loaderScript = <string>value;
			break;
		case 'runInSync':
			runInSync = <boolean>value;
			break;
		case 'socketPort':
			socketPort = <number>value;
			break;

		default:
			config[name] = value;
	}
});

const channel = new Channel({ url: config.basePath, sessionId: config.sessionId, port: socketPort });
const sendError = (error: Error) => channel.sendMessage('error', error);

config.channel = channel;

try {
	intern.configure(config);

	intern.debug(`Query: ${location.search}`);
	intern.debug(`Params: ${JSON.stringify(params)}`);

	// Forward all executor events back to the host Intern
	intern.on('*', data => {
		intern.debug(data);
		let promise = channel.sendMessage(data.name, data.data).catch(console.error);
		if (runInSync) {
			return promise;
		}
	});

	intern.debug('Configured intern');
	let loadPromise: Promise<any>;

	if (loaderScript) {
		intern.debug(`Loading loader script ${loaderScript}`);
		loadPromise = loadScript(loaderScript, config.basePath);
	}
	else {
		intern.debug(`Loading suites ${JSON.stringify(suites)}`);
		loadPromise = Promise.all(suites.map(suite => {
			loadScript(suite, config.basePath);
		}));
	}

	loadPromise.then(() => intern.run())
		.then(() => intern.debug('Finished intern'))
		.catch(sendError);
}
catch (error) {
	sendError(error);
}
