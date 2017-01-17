// Import the proper executor for the current environment
import initialize, { Config } from '../src/node';
import { parseCommandLine } from '../src/lib/parseArgs';
import Suite from '../src/lib/Suite';
import Test from '../src/lib/Test';

// import { assert } from 'chai';
// import Pretty from '../src/lib/reporters/Pretty';

const config: Config = {
	name: 'Test config',
	// reporters: [ new Pretty() ],
	filterErrorStack: true,
	args: parseCommandLine(process.argv.slice(2))
};

const intern = initialize(config);

// For instrumentation to work in Node, any modules that should be instrumented
// must be loaded *after* the Node executor is instantiated.
require('./unit/lib/EnvironmentType');

intern.addTest({
	name: 'foo',
	test: () => {
		return new Promise((_resolve, reject) => {
			setTimeout(() => {
				reject(new Error('badness'));
			}, 100);
		});
	}
});

intern.addTest({
	name: 'bar',
	test: () => {
	}
});

intern.addTest(new Suite({
	name: 'sub',
	tests: [
		new Test({
			name: 'foo',
			test: () => {}
		}),
		new Test({
			name: 'skipper',
			test: function (this: Test) {
				this.skip();
			}
		})
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
