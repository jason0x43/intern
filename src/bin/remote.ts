import intern from '../index';
import { RemoteConfig } from '../lib/RemoteSuite';
import { parseArgs } from '../lib/common/util';

const config = <RemoteConfig>parseArgs(process.argv.slice(2));

try {
	// Forward all executor events back to the Intern host
	intern.on('*', ({ name, data }) => {
		let promise = send({ name, data }).catch(error => {
			console.log(`Error sending ${name}: ${error.message}`);
			console.error(error);
		});

		// If config.runInSync is true, return the message promise so that
		// Intern will wait for acknowledgement before continuing testing
		if (config.runInSync) {
			return promise;
		}
	});

	send({ name: 'remoteStatus', data: 'initialized' });
	// Intern will be further configured and started via an execute command from
	// RemoteSuite
} catch (error) {
	console.error(error.message);
	send({ name: 'error', data: error });
}

function send(data: any) {
	return new Promise<void>((resolve, reject) => {
		process.send!(data, (error: Error) => {
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		});
	});
}
