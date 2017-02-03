import Remote from '../lib/executors/Remote';

declare let intern: Remote;

const params = intern.getQueryParams();
let suites = <string[]>params['suites'];
if (!Array.isArray(suites)) {
	suites = [suites];
}

intern.debug(`Loading suites ${JSON.stringify(suites)}`);

Promise.all(suites.map(suite => {
	intern.loadScript(suite);
})).then(() => {
	return intern.run();
}).catch(error => {
	return intern.emit('error', error);
});
