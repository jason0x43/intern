import Remote from '../lib/executors/Remote';

declare let intern: Remote;

const params = intern.getQueryParams();
let suites = <string[]>params['suites'];
if (!Array.isArray(suites)) {
	suites = [suites];
}

intern.log('Loading suites', suites);

// TODO: suites will come from the user, and should be relative to the project root. loadScript loads relative to
// Intern's root. Reconcile these.
Promise.all(suites.map(suite => {
	intern.loadScript(suite);
})).then(() => {
	return intern.run();
}).catch(error => {
	return intern.emit('error', error);
});
