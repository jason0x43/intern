import Remote, { Config } from '../lib/executors/Remote';
import { RemoteParams } from '../lib/RemoteSuite';
import Channel from '../lib/WebSocketChannel';

declare let intern: Remote;

Remote.initialize();

let loader;
let runInSync: boolean;

const params = <RemoteParams>intern.queryParams;
const config: Config = {
	channel: new Channel({ url: params.basePath, sessionId: params.sessionId, port: params.socketPort })
};

try {
	// Assign query parameters to the intern config, filtering out those that aren't valid config options
	Object.keys(params).forEach((name: keyof RemoteParams) => {
		const value = params[name];

		switch (name) {
			case 'loader':
				loader = <string>value;
				break;
			case 'runInSync':
				runInSync = <boolean>value;
				break;
			case 'loaderConfig':
			case 'socketPort':
			case 'suites':
				break;

			default:
				config[name] = value;
		}
	});

	intern.configure(config);

	if (!loader) {
		// Path is relative to Intern root
		loader = 'script';
	}
}
catch (error) {
	// Until intern is initialized, send any errors directly through the channel
	config.channel.sendMessage('error', error);
}

try {
	// Forward all executor events back to the Intern host
	intern.on('*', data => {
		let promise = intern.channel.sendMessage(data.name, data.data).catch(console.error);
		if (runInSync) {
			return promise;
		}
	});

	intern.log('Params:', params);
	intern.log('Initialized intern');

	intern.log('Using loader script', loader);
	intern.log('Intern base path:', intern.internBasePath);

	switch (loader) {
		case 'dojo':
		case 'script':
			loader = `${intern.internBasePath}/browser/loaders/${loader}.js`;
			break;
	}

	intern.loadScript(loader).catch(error => {
		intern.emit('error', error);
	});
}
catch (error) {
	// After intern is successfully initialized, emit any caught errors through it
	intern.emit('error', error);
}
