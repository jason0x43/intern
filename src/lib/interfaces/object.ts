import * as aspect from 'dojo/aspect';
import Suite, { SuiteProperties, SuiteLifecycleFunction } from '../Suite';
import Test, { TestFunction } from '../Test';
import { getIntern } from '../util';

export interface ObjectSuiteProperties extends SuiteProperties {
	after: SuiteLifecycleFunction;
	before: SuiteLifecycleFunction;
	tests: { [name: string]: Suite | Test | TestFunction };
}

export type ObjectSuiteOptions = Partial<ObjectSuiteProperties>;

export interface PropertyHandler {
	(property: string, value: any, suite: Suite): boolean;
}

function createSuite(descriptor: ObjectSuiteOptions, TestClass?: typeof Test, propertyHandler?: PropertyHandler) {
	/* jshint maxcomplexity: 13 */
	let suite = new Suite({});
	let test: any;
	let handled: boolean;
	let k: keyof ObjectSuiteOptions;

	for (k in descriptor) {
		test = descriptor[k];
		handled = propertyHandler && propertyHandler(k, test, suite);

		if (!handled) {
			handled = defaultPropertyHandler(k, test, suite);
		}

		if (!handled) {
			// Test isn't a function; assume it's a nested suite
			if (typeof test !== 'function') {
				const suiteOptions = <ObjectSuiteOptions>test;
				suiteOptions.name = suiteOptions.name || k;
				suite.add(createSuite(suiteOptions, TestClass, propertyHandler));
			}
			// Test is a function; create a Test instance for it
			else {
				suite.add(new TestClass({ name: k, test: test, parent: suite }));
			}
		}
	}

	return suite;
}

function defaultPropertyHandler(property: string, value: any, suite: Suite) {
	if (property === 'before') {
		property = 'setup';
	}
	if (property === 'after') {
		property = 'teardown';
	}

	switch (property) {
		case 'name':
		case 'timeout':
			(<{ [key: string]: any }> suite)[property] = value;
			return true;

		case 'setup':
		case 'beforeEach':
		case 'afterEach':
		case 'teardown':
			aspect.on(suite, property, value);
			return true;
	}

	return false;
}

/**
 * Register a new test suite. If provided, tests will be constructed using TestClass.
 *
 * @param mainDescriptor Object or IIFE describing the suite
 * @param TestClass Class to use to construct individual tests
 * @param propertyHandler Function to handle any properties that shouldn't be used as tests
 */
export default function registerSuite(mainDescriptor: ObjectSuiteOptions, TestClass?: typeof Test, propertyHandler?: PropertyHandler): void {
	TestClass = TestClass || Test;

	let descriptor = mainDescriptor;

	// enable per-suite closure, to match feature parity with other interfaces like tdd/bdd more closely;
	// without this, it becomes impossible to use the object interface for functional tests since there is no
	// other way to create a closure for each main suite
	if (typeof descriptor === 'function') {
		descriptor = descriptor();
	}

	getIntern().addTest(createSuite(descriptor, TestClass, propertyHandler));
}
