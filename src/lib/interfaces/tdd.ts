import { on } from 'dojo-core/aspect';
import Suite, { SuiteLifecycleFunction } from '../Suite';
import Test, { TestFunction } from '../Test';
import Executor from '../executors/Executor';

export interface TddInterface {
	suite(name: string, factory: SuiteLifecycleFunction): void;
	test(name: string, test: TestFunction): void;
	before(fn: SuiteLifecycleFunction): void;
	after(fn: SuiteLifecycleFunction): void;
	beforeEach(fn: SuiteLifecycleFunction): void;
	afterEach(fn: SuiteLifecycleFunction): void;
}

export default function getInterface(executor: Executor): TddInterface {
	let suiteStack: Suite[] = [];

	return {
		suite(name: string, factory: (suite: Suite) => void) {
			const currentSuite = getCurrent(suiteStack);
			const suite = new Suite({ name, tests: [], parent: currentSuite });
			if (!currentSuite) {
				// This is a new top-level suite, not a nested suite
				executor.addTest(suite);
			}
			suiteStack.push(suite);
			factory.call(suite, suite);
			suiteStack.pop();
		},

		test(name: string, test: TestFunction) {
			const currentSuite = getCurrent(suiteStack);
			currentSuite.tests.push(new Test({ name, test, parent: currentSuite }));
		},

		before(fn: SuiteLifecycleFunction) {
			const currentSuite = getCurrent(suiteStack);
			on(currentSuite, 'before', fn);
		},

		after(fn: SuiteLifecycleFunction) {
			const currentSuite = getCurrent(suiteStack);
			on(currentSuite, 'after', fn);
		},

		beforeEach(fn: SuiteLifecycleFunction) {
			const currentSuite = getCurrent(suiteStack);
			on(currentSuite, 'beforeEach', fn);
		},

		afterEach(fn: SuiteLifecycleFunction) {
			const currentSuite = getCurrent(suiteStack);
			on(currentSuite, 'afterEach', fn);
		}
	};
}

function getCurrent(stack: Suite[]) {
	return stack[stack.length - 1];
}
