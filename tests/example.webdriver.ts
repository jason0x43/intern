// Import the proper executor for the current environment
import WebDriver from '../src/lib/executors/WebDriver';
import initialize from '../src/intern';
import { inspect } from 'util';

const browser = 'firefox';
const debug = process.env['INTERN_DEBUG'] != null;

initialize(WebDriver, {
	name: 'Test config',
	contactTimeout: 6000,
	filterErrorStack: true,
	environments: [ { browserName: browser } ],
	tunnel: 'selenium' as 'selenium',
	tunnelOptions: { drivers: [ browser ] },
	socketPort: 9001,
	loaderScript: '_build/browser/scripts/dojo.js',
	suites: ['../tests/unit/lib/EnvironmentType.js'],
	debug
});

// For instrumentation to work in Node, any modules that should be instrumented
// must be loaded *after* the Node executor is instantiated.
require('./functional/lib/ProxiedSession');

if (debug) {
	intern.on('debug', data => {
		process.stderr.write('DEBUG: ' + inspect(data, { colors: true }) + '\n');
	});
}

intern.run();
