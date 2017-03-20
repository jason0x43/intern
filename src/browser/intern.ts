/**
 * This is the browser runner for end users. It simply loads and initializes a Browser executor.
 */
import Browser from '../lib/executors/Browser';
import Html from '../lib/reporters/Html';
import Console from '../lib/reporters/Console';
import { getConfig, loadAndRun } from '../lib/browser/util';

getConfig().then(config => {
	if (!config.reporters) {
		config.reporters = ['html'];
	}
	else if (config.reporters.indexOf('html') === -1) {
		config.reporters.push('html');
	}

	Browser.initialize(config);

	intern.registerReporter('html', Html);
	intern.registerReporter('console', Console);

	return loadAndRun(config);
}).catch(error => intern.emit('error', error));
