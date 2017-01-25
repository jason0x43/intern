// Import the proper executor for the current environment
import WebDriver from '../src/lib/executors/WebDriver';

const intern = WebDriver.create({
	name: 'Test config',
	filterErrorStack: true
});

// For instrumentation to work in Node, any modules that should be instrumented
// must be loaded *after* the Node executor is instantiated.
require('./functional/lib/ProxiedSession');

intern.run();
