// Import the proper executor for the current environment
import WebDriver from '../src/lib/executors/WebDriver';
import initialize from '../src/intern';

initialize(WebDriver, {
	name: 'Test config',
	contactTimeout: 30000,
	filterErrorStack: true,
	environments: [ { browserName: 'firefox' } ],
	suites: ['./unit/lib/EnvironmentType']
});

// For instrumentation to work in Node, any modules that should be instrumented
// must be loaded *after* the Node executor is instantiated.
require('./functional/lib/ProxiedSession');

intern.run();
