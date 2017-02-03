import { getQueryParams, loadScript } from './scripts/util';
import Remote, { Config } from './lib/executors/Remote';
import initialize from './intern';
import Channel from './lib/WebSocketChannel';

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

let loaderScript;
let runInSync: boolean;

const params: RemoteParams = <any>getQueryParams();
const config: Config = {
	channel: new Channel({ url: params.basePath, sessionId: params.sessionId, port: params.socketPort })
};

try {
	// Assign query parameters to the intern config, filtering out those that aren't valid config options
	Object.keys(params).forEach((name: keyof RemoteParams) => {
		const value = params[name];

		switch (name) {
			case 'loaderScript':
				loaderScript = <string>value;
				break;
			case 'runInSync':
				runInSync = <boolean>value;
				break;
			case 'socketPort':
			case 'suites':
				break;

			default:
				config[name] = value;
		}
	});

	initialize(Remote, config);

	if (!loaderScript) {
		loaderScript = 'browser/scripts/script.js';
	}
}
catch (error) {
	// Until intern is initialized, send any errors directly through the channel
	config.channel.sendMessage('error', error);
}

try {
	intern.debug(`Params: ${JSON.stringify(params)}`);
	intern.debug('Initialized intern');

	// Forward all executor events back to the Intern host
	intern.on('*', data => {
		intern.debug(data);
		let promise = intern.channel.sendMessage(data.name, data.data).catch(console.error);
		if (runInSync) {
			return promise;
		}
	});

	intern.debug(`Using loader script ${loaderScript}`);
	loadScript(loaderScript).catch(error => {
		intern.emit('error', error);
	});
}
catch (error) {
	// After intern is successfully initialized, emit any caught errors through it
	intern.emit('error', error);
}
