import Remote from '../../lib/executors/Remote';

declare let intern: Remote;

const suites = intern.queryParams.suites || [];
intern.log('Loading suites', suites);
intern.loadScript(intern.queryParams.suites).then(() => {
	return intern.run();
}).catch(error => intern.emit('error', error));
