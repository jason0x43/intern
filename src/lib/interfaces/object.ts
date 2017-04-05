import * as aspect from 'dojo/aspect';
import * as main from '../../main';
import Suite, { SuiteConfig, SuiteLifecycleFunction } from '../Suite';
import Test from '../Test';

export interface ObjectSuiteConfig extends SuiteConfig {
	after?: SuiteLifecycleFunction;
	before?: SuiteLifecycleFunction;
}

function createSuite(descriptor: ObjectSuiteConfig, parentSuite: Suite, TestClass?: typeof Test, propertyHandler?: PropertyHandler): void {
	/* jshint maxcomplexity: 13 */
	let suite = new Suite({ parent: parentSuite });
	let tests = suite.tests;
	let test: any;

	parentSuite.tests.push(suite);

	for (let k in descriptor) {
		test = descriptor[k];

		if (k === 'before') {
			k = 'setup';
		}
		if (k === 'after') {
			k = 'teardown';
		}

		switch (k) {
		case 'name':
		case 'timeout':
			(<{ [key: string]: any }> suite)[k] = test;
			break;
		case 'setup':
		case 'beforeEach':
		case 'afterEach':
		case 'teardown':
			aspect.on(suite, k, test);
			break;
		default:
			if (typeof test !== 'function') {
				test.name = test.name || k;
				createSuite(test, suite, TestClass, propertyHandler);
			}
			else {
				tests.push(new Test({ name: k, test: test, parent: suite }));
			}
		}
	}
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
			suite[property] = value;
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
 * @param {function|...object~SuiteDescriptor} mainDescriptor - Object or IIFE describing the suite
 * @param {function?} TestClass - Class to use to construct individual tests
 * @param {function?} propertyHandler - Function to handle any properties that shouldn't be used as tests
 */
export default function registerSuite(mainDescriptor: ObjectSuiteConfig, TestClass?: typeof Test, propertyHandler?: PropertyHandler): void {
	TestClass = TestClass || Test;

	main.executor.register(function (suite: Suite) {
		let descriptor = mainDescriptor;

		// enable per-suite closure, to match feature parity with other interfaces like tdd/bdd more closely;
		// without this, it becomes impossible to use the object interface for functional tests since there is no
		// other way to create a closure for each main suite
		if (typeof descriptor === 'function') {
			descriptor = descriptor();
		}

		createSuite(descriptor, suite, TestClass, propertyHandler);
	});
}
