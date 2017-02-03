import global from 'dojo-core/global';
import Remote from '../lib/executors/Remote';

declare let intern: Remote;

const params = intern.getQueryParams();

let suites = <string[]>params['suites'];
if (!Array.isArray(suites)) {
	suites = [suites];
}

let loaderConfig: any = {};
if (params['loaderConfig']) {
	loaderConfig = params['loaderConfig'];
}

if (!loaderConfig.baseUrl) {
	loaderConfig.baseUrl = intern.basePath;
}

const loader = `${intern.basePath}node_modules/dojo-loader/loader.js`;

intern.loadScript(loader).then(() => {
	intern.debug('Loaded dojo loader');

	const loader = global.require;
	loader.on('error', (error: Error) => intern.emit('error', error));

	intern.debug('Loader config:', loaderConfig);
	loader.config(loaderConfig);

	intern.debug('Loading suites:', suites);
	intern.debug('Using loader', loader);
	loader(suites, () => intern.run());
}).catch(error => {
	intern.emit('error', error);
});
