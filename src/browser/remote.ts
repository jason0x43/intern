import Remote from '../lib/executors/Remote';
import { getConfig, loadAndRun, parseQuery } from '../lib/browser/util';
import { parseArgs } from '../lib/util';
import Channel from '../lib/WebSocketChannel';

const args = parseArgs(parseQuery());
const channel = new Channel({
	url: args.basePath,
	sessionId: args.sessionId,
	port: args.socketPort
});

getConfig().then(config => {
	Remote.initialize(config);

	// Forward all executor events back to the Intern host
	intern.on('*', ({ name, data }) => {
		let promise = channel.sendMessage(name, data).catch(console.error);
		if (config.runInSync) {
			return promise;
		}
	});

	return loadAndRun(config);
}).catch(error => channel.sendMessage('error', error));
