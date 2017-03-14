import Remote from '../../lib/executors/Remote';

declare let intern: Remote;

const params = intern.getQueryParams();
let suites = <string[]>params['suites'];
if (!Array.isArray(suites)) {
	suites = [suites];
}

intern.log('Loading suites', intern.queryParams.suites);
intern.loadScript(...intern.queryParams.suites).then(() => {
	return intern.run();
}).catch(error => {
	return intern.emit('error', error);
});
