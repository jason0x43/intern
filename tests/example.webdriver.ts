// Import the proper executor for the current environment
import WebDriver from '../src/lib/executors/WebDriver';
import initialize from '../src/intern';

const browser = 'chrome';

initialize(WebDriver, {
	name: 'Test config',
	contactTimeout: 30000,
	filterErrorStack: true,
	environments: [ { browserName: browser } ],
	tunnel: 'selenium' as 'selenium',
	tunnelOptions: { drivers: [ browser ] },
	suites: ['./_build/browser/tests/unit/all.js']
});

// For instrumentation to work in Node, any modules that should be instrumented
// must be loaded *after* the Node executor is instantiated.
require('./functional/lib/ProxiedSession');

intern.run();
