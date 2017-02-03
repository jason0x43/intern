import global from 'dojo-core/global';
import Remote from '../lib/executors/Remote';

declare let intern: Remote;

const params = intern.getQueryParams();
let suites = <string[]>params['suites'];
if (!Array.isArray(suites)) {
	suites = [suites];
}

intern.loadScript('../node_modules/dojo-loader/loader.js').then(() => {
	intern.debug('Loaded dojo loader');

	const loader = global.require;
	loader.on('error', (error: Error) => intern.emit('error', error));

	const config = { baseUrl: intern.config.basePath };
	intern.debug(`Loader config: ${JSON.stringify(config)}`);
	loader.config(config);

	intern.debug(`Loading suites: ${JSON.stringify(suites)}`);
	intern.debug(`Using loader ${loader.toString()}`);
	loader(suites, () => intern.run());
}).catch(error => {
	intern.emit('error', error);
});
