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

let suites: string[] = [];
let loaderScript: string;
let runInSync: boolean;

const params: RemoteParams = <any>getQueryParams();
const config: Config = {
	channel: new Channel({ url: params.basePath, sessionId: params.sessionId, port: params.socketPort })
};
const sendError = (error: Error) => config.channel.sendMessage('error', error);

try {
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
				break;

			default:
				config[name] = value;
		}
	});

	initialize(Remote, config);

	intern.debug(`Params: ${JSON.stringify(params)}`);

	// Forward all executor events back to the host Intern
	intern.on('*', data => {
		intern.debug(data);
		let promise = intern.channel.sendMessage(data.name, data.data).catch(console.error);
		if (runInSync) {
			return promise;
		}
	});

	intern.debug('Configured intern');

	if (loaderScript) {
		intern.debug(`Loading loader script ${loaderScript}`);
		loadScript(loaderScript, config.basePath).catch(sendError);
	}
	else {
		intern.debug(`Loading suites ${JSON.stringify(suites)}`);
		Promise.all(suites.map(suite => {
			loadScript(suite, config.basePath);
		})).then(() => intern.run()).catch(sendError);
	}
}
catch (error) {
	sendError(error);
}
