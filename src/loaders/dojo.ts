/**
 * A loader script for setting up the Dojo loader.
 *
 * Note that loader scripts must be simple scripts, not modules.
 */
intern.registerLoader((config, done) => {
	const loaderConfig: any = config.loader.config || {};
	loaderConfig.baseUrl = loaderConfig.baseUrl || config.basePath;
	if (!('async' in loaderConfig)) {
		loaderConfig.async = true;
	}

	const globalObj: any = typeof window !== 'undefined' ? window : global;
	intern.log('Configuring loader with:', loaderConfig);
	globalObj.dojoConfig = loaderConfig;

	intern.loadScript('node_modules/dojo/dojo.js').then(() => {
		intern.log('Loaded dojo loader');

		const loader = globalObj.require;
		intern.log('Using loader', loader);

		intern.log('Loading suites:', config.suites);
		loader(config.suites, () => done());
	}).catch(done);
});
