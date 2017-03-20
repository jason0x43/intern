#!/usr/bin/env node

import Node from '../Node';
import WebDriver from '../WebDriver';
import { getConfig, projectRequire } from '../lib/node/util';

getConfig().then(config => {
	if (config.webdriver) {
		WebDriver.initialize(config);
	}
	else {
		Node.initialize(config);
	}

	if (config.loader) {
		projectRequire(config.loader);
	}
	else {
		if (config.webDriver) {
			config.functionalSuites.forEach(projectRequire);
		}
		else {
			config.suites.forEach(projectRequire);
		}
	}

	return intern.run();
}).catch(error => {
	console.error(error);
	process.exitCode = 1;
});
