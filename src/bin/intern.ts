#!/usr/bin/env node

import Node from '../lib/executors/Node';
import WebDriver from '../lib/executors/WebDriver';
import { getConfig, projectRequire } from '../lib/node/util';
import { getLoaderScript } from '../lib/util';

getConfig().then(rawConfig => {
	const isWebDriver = rawConfig.webdriver;

	if (isWebDriver) {
		WebDriver.initialize(rawConfig);
	}
	else {
		Node.initialize(rawConfig);
	}

	const config = intern.config;
	const loader = getLoaderScript(config);

	if (loader) {
		projectRequire(loader);
	}
	else if (isWebDriver) {
		config.functionalSuites.forEach(projectRequire);
	}
	else {
		config.suites.forEach(projectRequire);
	}

	return intern.run();
}).catch(error => {
	console.error(error);
	process.exitCode = 1;
});
