import Test, { SKIP, TestOptions, TestProperties } from './Test';
import { InternError } from './types';
import Deferred from './Deferred';
import Task from 'dojo-core/async/Task';
import { mixin } from 'dojo-core/lang';
import Benchmark = require('benchmark');

/**
 * A wrapper around a Benchmark.js Benchmark that maps its API to that used by Test.
 */
export default class BenchmarkTest extends Test {
	test: BenchmarkTestFunction;

	benchmark: InternBenchmark;

	constructor(descriptor: BenchmarkTestOptions) {
		// Call the superclass constructor with the set of descriptor keys not specific to BenchmarkTest
		let args: TestOptions = <TestOptions>{};
		Object.keys(descriptor).forEach((key: keyof BenchmarkTestOptions) => {
			switch (key) {
				case 'test':
				case 'options':
					break;
				default:
					(<any>args)[key] = descriptor[key];
			}
		});

		super(args);

		// `options`, if present, will be a property on the test function
		this.test = (descriptor && descriptor.test) || /* istanbul ignore next */ function () { };

		const options: BenchmarkOptions = mixin({}, this.test.options, {
			async: true,
			setup: createLifecycle(true),
			teardown: createLifecycle(false)
		});

		if (options.defer) {
			this.test = (testFunction => (test: BenchmarkTest, deferred?: Deferred<any>) => {
				const dfd = createDeferred(test.benchmark, deferred, options.numCallsUntilResolution);
				testFunction.call(this, this, dfd);
			})(this.test);
		}

		this.benchmark = new Benchmark(
			descriptor.name,
			options.defer ?
			'this.benchmark.internTest.test(this.benchmark.internTest, deferred);' :
			'this.internTest.test(this.internTest);',
			options
		);

		Object.defineProperty(this.benchmark, 'name', {
			get: () => {
				return this.name;
			},
			set: name => {
				this.name = name;
			}
		});

		this.benchmark.internTest = this;
	}

	get timeElapsed() {
		if (this.benchmark && this.benchmark.times) {
			return this.benchmark.times.elapsed;
		}
		return 0;
	}

	set timeElapsed(_value: number) {
		// ignore
	}

	async(_timeout?: number, _numCallsUntilResolution?: number): Deferred<any> {
		throw new Error('Benchmark tests must be marked as asynchronous and use the deferred ' +
			'passed to them rather than call `this.async()`.');
	}

	run(): Task<void> {
		this.hasPassed = false;
		this._usesRemote = false;

		const benchmark = this.benchmark;

		return new Task(
			(resolve, reject) => {
				benchmark.on('abort', () => {
					reject(benchmark.error);
				});

				benchmark.on('error', () => {
					if (benchmark.error === SKIP) {
						resolve();
					}
					else {
						reject(benchmark.error);
					}
				});

				benchmark.on('complete', () => {
					resolve();
				});

				this.executor.emit('testStart', this).then(() => {
					benchmark.run();
				});
			},
			() => {
				benchmark.abort();
			}
		).finally(() => {
			// Stop listening for benchmark events once the test is finished
			benchmark.off();
		})
		.then(
			() => {
				this.hasPassed = true;
			},
			error => {
				this.error = error;
				throw error;
			}
		)
		.finally(() => this.executor.emit('testEnd', this));
	}

	static async(testFunction: BenchmarkDeferredTestFunction, numCallsUntilResolution?: number) {
		testFunction.options = mixin({}, testFunction.options, {
			defer: true,
			numCallsUntilResolution: numCallsUntilResolution
		});

		return <BenchmarkTestFunction>testFunction;
	}
}

export interface BenchmarkTestFunction {
	(this: BenchmarkTest, test: BenchmarkTest): void | Promise<any>;
	options?: BenchmarkOptions;
}

export interface BenchmarkDeferredTestFunction {
	(this: BenchmarkTest, test: BenchmarkTest, deferred: Deferred<void>): void | Promise<any>;
	options?: BenchmarkOptions;
}

export interface BenchmarkTestProperties extends TestProperties {
	test: BenchmarkTestFunction;
	skip: string;
	numCallsUntilResolution: number;
}

export type BenchmarkTestOptions = Partial<BenchmarkTestProperties> & {
	name: string,
	test: BenchmarkTestFunction;
	options?: BenchmarkOptions
};

export interface BenchmarkOptions extends Benchmark.Options {
	skip?: string;
	numCallsUntilResolution?: number;
}

export interface InternBenchmark extends Benchmark {
	internTest?: BenchmarkTest;
}

const createLifecycle = (before: boolean) => {
	const queueName = before ? 'Before' : 'After';
	const queueMethod = before ? 'push' : 'unshift';
	const methodName = before ? 'before' : 'after';
	return [
		`(function (benchmark) {`,
		`	var queue = benchmark.intern${queueName}EachLoopQueue;`,
		`	var suite;`,
		`	if (!queue) {`,
		`		suite = benchmark.internTest;`,
		`		benchmark.intern${queueName}EachLoopQueue = queue = [];`,
		`		while ((suite = suite.parent)) {`,
		`			if (suite.${methodName}EachLoop) {`,
		`				queue.${queueMethod}(suite);`,
		`			}`,
		`		}`,
		`	}`,
		`	var i = queue.length;`,
		`	while((suite = queue[--i])) {`,
		`		suite.${methodName}EachLoop();`,
		`	}`,
		`})(this.benchmark || this);\n`
	].join('\n');
};

function createDeferred(benchmark: Benchmark, deferred: Deferred<any>, numCallsUntilResolution?: number) {
	if (!numCallsUntilResolution) {
		numCallsUntilResolution = 1;
	}

	return {
		resolve() {
			--numCallsUntilResolution;
			if (numCallsUntilResolution === 0) {
				deferred.resolve();
			}
			else if (numCallsUntilResolution < 0) {
				throw new Error('resolve called too many times');
			}
		},

		reject(error: InternError) {
			benchmark.error = error;
			benchmark.abort();
			deferred.resolve();
		},

		rejectOnError(this: any, callback: Function) {
			const self = this;
			return function (this: any) {
				try {
					return callback.apply(this, arguments);
				}
				catch (error) {
					self.reject(error);
				}
			};
		},

		callback: function (this: any, callback: Function) {
			const self = this;
			return this.rejectOnError(function (this: any) {
				const returnValue = callback.apply(this, arguments);
				self.resolve();
				return returnValue;
			});
		}
	};
}
