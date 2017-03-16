import Remote from '../../lib/executors/Remote';

declare let intern: Remote;

intern.log('Loading suites');
intern.loadScript(intern.config.suites).then(() => {
	return intern.run();
}).catch(error => intern.emit('error', error));
