import objectRegisterSuite, { ObjectSuiteOptions } from './object';
import Suite from '../Suite';
import BenchmarkTest from '../BenchmarkTest';
import aspect = require('dojo/aspect');

function propertyHandler(property: string, value: any, suite: Suite) {
	if (property === 'beforeEachLoop' || property === 'afterEachLoop') {
		aspect.on(suite, property, value);
		return true;
	}
}

export default function registerSuite(mainDescriptor: ObjectSuiteOptions) {
	mainDescriptor.TestClass = BenchmarkTest;
	objectRegisterSuite(mainDescriptor);
};

const async = BenchmarkTest.async;
export { async as async };

const skip = BenchmarkTest.skip;
export { skip as skip };

export { BenchmarkTestFunction } from '../BenchmarkTest';
