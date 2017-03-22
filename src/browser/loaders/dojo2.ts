import global from 'dojo-core/global';

intern.registerLoader(config => {
	const loaderConfig: any = config.loader.config || {};
	loaderConfig.baseUrl = loaderConfig.baseUrl || config.basePath;

	intern.loadScript(`${config.basePath}node_modules/dojo-loader/loader.js`).then(() => {
		intern.log('Loaded dojo loader');

		const loader = global.require;
		intern.log('Using loader', loader);

		loader.on('error', (error: Error) => intern.emit('error', error));

		intern.log('Loader config:', loaderConfig);
		loader.config(loaderConfig);

		intern.log('Loading suites:', config.suites);
		loader(config.suites, () => intern.run());
	}).catch(error => intern.emit('error', error));
});
