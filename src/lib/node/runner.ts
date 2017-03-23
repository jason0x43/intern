import Node from '../executors/Node';
import WebDriver from '../executors/WebDriver';
import Task from 'dojo-core/async/Task';
import { projectRequire } from './util';
import { getLoaderScript } from '../util';

export default function run(rawConfig: any) {
	return new Task<void>((resolve, reject) => {
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

		intern.run().then(resolve, reject);
	});
}
