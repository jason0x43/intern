import { on } from 'dojo/aspect';
import Suite, { SuiteLifecycleFunction } from '../Suite';
import Test, { TestFunction } from '../Test';
import Executor, { Events } from '../executors/Executor';

export interface TddInterface {
	suite(name: string, factory: TestFunction): void;
	test(name: string, test: TestFunction): void;
	before(fn: SuiteLifecycleFunction): void;
	after(fn: SuiteLifecycleFunction): void;
	beforeEach(fn: SuiteLifecycleFunction): void;
	afterEach(fn: SuiteLifecycleFunction): void;
}

export default function getInterface(executor: Executor<Events>): TddInterface {
	let currentSuite: Suite;

	return {
		suite(name: string, factory: () => void) {
			if (!currentSuite) {
				// This is a new top-level suite, not a nested suite
				currentSuite = new Suite({ name, tests: [] });
				executor.addTest(currentSuite);
			}
			factory.call(currentSuite);
		},

		test(name: string, test: TestFunction) {
			currentSuite.tests.push(new Test({ name, test, parent: currentSuite }));
		},

		before(fn: SuiteLifecycleFunction) {
			on(currentSuite, 'before', fn);
		},

		after(fn: SuiteLifecycleFunction) {
			on(currentSuite, 'after', fn);
		},

		beforeEach(fn: SuiteLifecycleFunction) {
			on(currentSuite, 'beforeEach', fn);
		},

		afterEach(fn: SuiteLifecycleFunction) {
			on(currentSuite, 'afterEach', fn);
		}
	};
}
