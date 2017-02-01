import { getQueryParams, loadScript } from './util';
import global from 'dojo-core/global';
import Browser from '../lib/executors/Browser';

declare let intern: Browser;

const params = getQueryParams();
let suites = <string[]>params['suites'];
if (!Array.isArray(suites)) {
	suites = [suites];
}

loadScript('node_modules/dojo-loader/loader.js', '/').then(() => {
	intern.debug('Loaded loader');
	const loader = global.require;
	loader.config({
		packages: [
			{ name: 'chai', location: '../../node_modules/chai', main: 'chai' }
		]
	});

	intern.debug(`Loading suites: ${JSON.stringify(suites)}`);
	intern.debug(`Using loader ${loader.toString()}`);

	loader(suites, () => {
		intern.debug(`Starting intern`);
		intern.run().then(
			() => {
				intern.debug('Finished intern');
			},
			error => {
				console.error(error);
				intern.channel.sendMessage('error', error);
			}
		);
	});
});
