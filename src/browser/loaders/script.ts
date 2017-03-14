import Remote from '../../lib/executors/Remote';

declare let intern: Remote;

intern.log('Loading suites', intern.queryParams.suites);
intern.loadScript(...intern.queryParams.suites).then(() => {
	return intern.run();
}).catch(error => intern.emit('error', error));
