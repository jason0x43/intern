import Remote from '../lib/executors/Remote';
import { loadSuitesAndRun, parseQuery } from '../lib/browser/util';
import { parseArgs } from '../lib/util';
import Channel from '../lib/WebSocketChannel';

const config = parseArgs(parseQuery());
const channel = new Channel({
	url: config.basePath,
	sessionId: config.sessionId,
	port: config.socketPort
});

try {
	Remote.initialize(config);

	// Forward all executor events back to the Intern host
	intern.on('*', ({ name, data }) => {
		let promise = channel.sendMessage(name, data).catch(console.error);
		if (config.runInSync) {
			return promise;
		}
	});

	loadSuitesAndRun().catch(error => channel.sendMessage('error', error));
}
catch (error) {
	channel.sendMessage('error', error);
}
