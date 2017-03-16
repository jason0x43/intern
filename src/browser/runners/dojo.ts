import global from 'dojo-core/global';
import Remote from '../../lib/executors/Remote';

declare let intern: Remote;

const loaderConfig: any = intern.config.runnerConfig || {};
loaderConfig.baseUrl = loaderConfig.baseUrl || intern.basePath;
if (!('async' in loaderConfig)) {
	loaderConfig.async = true;
}

intern.log('Loader config:', loaderConfig);
global.dojoConfig = loaderConfig;

intern.loadScript(`${intern.basePath}node_modules/dojo/dojo.js`).then(() => {
	intern.log('Loaded dojo loader');

	const loader = global.require;
	intern.log('Using loader', loader);

	intern.log('Loading suites:', intern.config.suites);
	loader(intern.config.suites, () => intern.run());
}).catch(error => intern.emit('error', error));
