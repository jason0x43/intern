import { getQueryParams, loadScript } from './util';
import global from 'dojo-core/global';
import Remote from '../lib/executors/Remote';

declare let intern: Remote;

const params = getQueryParams();
let suites = <string[]>params['suites'];
if (!Array.isArray(suites)) {
	suites = [suites];
}

loadScript('node_modules/dojo-loader/loader.js', intern.config.basePath).then(() => {
	intern.debug('Loaded dojo loader');
	const loader = global.require;
	const config = {
		baseUrl: intern.config.basePath,
		packages: [
			{ name: 'chai', location: 'node_modules/chai', main: 'chai' }
		]
	};
	intern.debug(`Loader config: ${JSON.stringify(config)}`);
	loader.config(config);

	intern.debug(`Loading suites: ${JSON.stringify(suites)}`);
	intern.debug(`Using loader ${loader.toString()}`);

	loader(suites, () => intern.run());
}).catch(error => {
	intern.emit('error', error);
});
