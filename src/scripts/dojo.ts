import global from 'dojo-core/global';
import Remote from '../lib/executors/Remote';

declare let intern: Remote;

const params = intern.getQueryParams();

let suites = <string[]>params['suites'];
if (!Array.isArray(suites)) {
	suites = [suites];
}

let loaderConfig: any = params['loaderConfig'] || {};
loaderConfig.baseUrl = loaderConfig.baseUrl || intern.basePath;

const loader = `${intern.basePath}node_modules/dojo-loader/loader.js`;

intern.loadScript(loader).then(() => {
	intern.log('Loaded dojo loader');

	const loader = global.require;
	loader.on('error', (error: Error) => intern.emit('error', error));

	intern.log('Loader config:', loaderConfig);
	loader.config(loaderConfig);

	intern.log('Loading suites:', suites);
	intern.log('Using loader', loader);
	loader(suites, () => intern.run());
}).catch(error => {
	intern.emit('error', error);
});
