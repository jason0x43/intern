// Import the proper executor for the current environment
import Node from '../src/lib/executors/Node';
import { parseCommandLine } from '../src/lib/parseArgs';
import Suite from '../src/lib/Suite';
import Test from '../src/lib/Test';

import { assert } from 'chai';

const intern = Node.create({
	name: 'Test config',
	filterErrorStack: true,
	args: parseCommandLine(process.argv.slice(2)),
	reporters: [ 'simple' ]
});

// For instrumentation to work in Node, any modules that should be instrumented
// must be loaded *after* the Node executor is instantiated.
require('./unit/lib/EnvironmentType');

intern.addTest({
	name: 'foo',
	test: () => {
		assert(false, 'bad thing happened');
	}
});

intern.addTest(new Suite({
	name: 'sub',
	tests: [
		{
			name: 'foo',
			test: () => {}
		},
		{
			name: 'skipper',
			test: function (this: Test) {
				this.skip();
			}
		}
	]
}));

intern.addTest({
	name: 'baz',
	test: () => {
		return new Promise(resolve => {
			setTimeout(() => {
				resolve();
			}, 200);
		});
	}
});

intern.run();
