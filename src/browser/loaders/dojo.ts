import global from 'dojo-core/global';

intern.registerLoader(config => {
	const loaderConfig: any = config.loader.config || {};
	loaderConfig.baseUrl = loaderConfig.baseUrl || config.basePath;
	if (!('async' in loaderConfig)) {
		loaderConfig.async = true;
	}

	intern.log('Loader config:', loaderConfig);
	global.dojoConfig = loaderConfig;

	intern.loadScript(`${config.basePath}node_modules/dojo/dojo.js`).then(() => {
		intern.log('Loaded dojo loader');

		const loader = global.require;
		intern.log('Using loader', loader);

		intern.log('Loading suites:', config.suites);
		return new Promise(resolve => {
			loader(config.suites, resolve);
		});
	}).catch(error => intern.emit('error', error));
});
