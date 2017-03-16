import global from 'dojo-core/global';
import Remote from '../../lib/executors/Remote';

declare let intern: Remote;

const loaderConfig: any = intern.config.runnerConfig || {};
loaderConfig.baseUrl = loaderConfig.baseUrl || intern.basePath;

intern.loadScript(`${intern.basePath}node_modules/dojo-loader/loader.js`).then(() => {
	intern.log('Loaded dojo loader');

	const loader = global.require;
	intern.log('Using loader', loader);

	loader.on('error', (error: Error) => intern.emit('error', error));

	intern.log('Loader config:', loaderConfig);
	loader.config(loaderConfig);

	intern.log('Loading suites:', intern.config.suites);
	loader(intern.config.suites, () => intern.run());
}).catch(error => intern.emit('error', error));
