import { on } from 'dojo/aspect';
import Suite, { SuiteLifecycleFunction } from '../Suite';
import Test, { TestFunction } from '../Test';
import Executor from '../executors/Executor';

export interface TddInterface {
	suite(name: string, factory: TestFunction): void;
	test(name: string, test: TestFunction): void;
	before(fn: SuiteLifecycleFunction): void;
	after(fn: SuiteLifecycleFunction): void;
	beforeEach(fn: SuiteLifecycleFunction): void;
	afterEach(fn: SuiteLifecycleFunction): void;
}

export default function getInterface(executor: Executor): TddInterface {
	let currentSuite: Suite;

	return {
		suite(name: string, factory: TestFunction) {
			if (!currentSuite) {
				currentSuite = new Suite({ name, tests: [ factory ] });
				executor.addTest(currentSuite);
			} else {
				// TODO: this seems wrong
				currentSuite.add(factory);
			}
		},

		test(name: string, test: TestFunction) {
			currentSuite.tests.push(new Test({ name, test, parent: currentSuite }));
		},

		before(fn: SuiteLifecycleFunction) {
			on(currentSuite, 'setup', fn);
		},

		after(fn: SuiteLifecycleFunction) {
			on(currentSuite, 'teardown', fn);
		},

		beforeEach(fn: SuiteLifecycleFunction) {
			on(currentSuite, 'beforeEach', fn);
		},

		afterEach(fn: SuiteLifecycleFunction) {
			on(currentSuite, 'afterEach', fn);
		}
	};
}
