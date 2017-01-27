/**
 * Object interface for registering suites
 */

import Suite, { isSuiteOptions, SuiteOptions, SuiteProperties, SuiteLifecycleFunction } from '../Suite';
import Test, { isTestOptions, TestFunction, TestOptions } from '../Test';
import Executor, { Events } from '../executors/Executor';

export interface ObjectInterface {
	registerSuite(mainDescriptor: ObjectSuiteOptions | ObjectSuiteFactory): void;
}

export interface ObjectSuiteFactory {
	(): ObjectSuiteOptions;
}

export interface ObjectSuiteProperties extends SuiteProperties {
	setup: SuiteLifecycleFunction;
	teardown: SuiteLifecycleFunction;
	TestClass: typeof Test;
}

export type ObjectSuiteOptions = Partial<ObjectSuiteProperties> & {
	name: string;
	tests: { [name: string]: SuiteOptions | TestOptions | TestFunction };
};

export default function getInterface(executor: Executor<Events>) {
	return {
		registerSuite(mainDescriptor: ObjectSuiteOptions) {
			_registerSuite(executor, mainDescriptor);
		}
	};
}

const propertyMap: { [key: string]: keyof SuiteProperties } = {
	teardown: 'after',
	setup: 'before'
};

function createSuite(descriptor: ObjectSuiteOptions) {
	let options: SuiteOptions = { name: null, tests: [] };

	Object.keys(descriptor).filter(k => {
		return k !== 'tests';
	}).map((k: keyof ObjectSuiteOptions) => {
		return <keyof SuiteProperties>(propertyMap[k] || k);
	}).forEach(k => {
		options[k] = descriptor[k];
	});

	const TestClass = descriptor.TestClass || Test;
	const tests = descriptor.tests;
	options.tests = Object.keys(tests).map(name => {
		const thing = tests[name];
		if (isSuiteOptions(thing) || isTestOptions(thing)) {
			thing.name = name;
			if (isSuiteOptions(thing)) {
				return new Suite(thing);
			}
			else {
				return new Test(thing);
			}
		}
		return new TestClass({ name, test: thing });
	});

	return new Suite(options);
}

/**
 * Register a new test suite. If provided, tests will be constructed using TestClass.
 *
 * @param mainDescriptor Object or IIFE describing the suite
 */
function _registerSuite(executor: Executor<Events>, mainDescriptor: ObjectSuiteOptions) {
	let descriptor = mainDescriptor;

	// Enable per-suite closure, to match feature parity with other interfaces like tdd/bdd more closely; without this,
	// it becomes impossible to use the object interface for functional tests since there is no other way to create a
	// closure for each main suite
	if (typeof descriptor === 'function') {
		descriptor = descriptor();
	}

	executor.addTest(createSuite(descriptor));
}
