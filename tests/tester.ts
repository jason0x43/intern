// Import the proper executor for the current environment
import Node from '../src/lib/executors/Node';
import { parseCommandLine } from '../src/lib/parseArgs';
// import Suite from '../src/lib/Suite';
// import Test from '../src/lib/Test';
import Pretty from '../src/lib/reporters/Pretty';

// import { assert } from 'chai';

const intern = new Node({
	name: 'Test config',
	filterErrorStack: true,
	args: parseCommandLine(process.argv.slice(2))
});

new Pretty(intern);

// For instrumentation to work in Node, any modules that should be instrumented
// must be loaded *after* the Node executor is instantiated.
require('./unit/lib/EnvironmentType');

// intern.addTest({
// 	name: 'foo',
// 	test: () => {
// 		return new Promise((_resolve, reject) => {
// 			setTimeout(() => {
// 				reject(new Error('badness'));
// 			}, 100);
// 		});
// 	}
// });

// intern.addTest({
// 	name: 'bar',
// 	test: () => {
// 	}
// });

// intern.addTest(new Suite({
// 	name: 'sub',
// 	tests: [
// 		new Test({
// 			name: 'foo',
// 			test: () => {}
// 		}),
// 		new Test({
// 			name: 'skipper',
// 			test: function (this: Test) {
// 				this.skip();
// 			}
// 		})
// 	]
// }));

// intern.addTest({
// 	name: 'baz',
// 	test: () => {
// 		return new Promise(resolve => {
// 			setTimeout(() => {
// 				resolve();
// 			}, 200);
// 		});
// 	}
// });

intern.run();
