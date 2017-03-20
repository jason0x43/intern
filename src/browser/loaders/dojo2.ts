import global from 'dojo-core/global';

intern.registerLoader(config => {
	const loaderConfig: any = config.loaderConfig || {};
	loaderConfig.baseUrl = loaderConfig.baseUrl || intern.config.basePath;

	intern.loadScript(`${intern.config.basePath}node_modules/dojo-loader/loader.js`).then(() => {
		intern.log('Loaded dojo loader');

		const loader = global.require;
		intern.log('Using loader', loader);

		loader.on('error', (error: Error) => intern.emit('error', error));

		intern.log('Loader config:', loaderConfig);
		loader.config(loaderConfig);

		intern.log('Loading suites:', intern.config.suites);
		loader(intern.config.suites, () => intern.run());
	}).catch(error => intern.emit('error', error));
});
