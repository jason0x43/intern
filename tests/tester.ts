// Import the proper executor for the current environment
import Node, { Config } from '../src/lib/executors/Node';
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

const executor = new Node(config);

// For instrumentation to work in Node, any modules that should be instrumented
// must be loaded *after* the Node executor is instantiated.
executor.addFile('_build/tests/unit/lib/EnvironmentType');

executor.addTest({
	name: 'foo',
	test: () => {
		return new Promise((_resolve, reject) => {
			setTimeout(() => {
				reject(new Error('badness'));
			}, 100);
		});
	}
});

executor.addTest({
	name: 'bar',
	test: () => {
	}
});

executor.addTest(new Suite({
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

executor.addTest({
	name: 'baz',
	test: () => {
		return new Promise(resolve => {
			setTimeout(() => {
				resolve();
			}, 200);
		});
	}
});

executor.run();
