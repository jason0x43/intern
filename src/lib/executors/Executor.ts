import Suite, { isSuiteOptions, SuiteOptions } from '../Suite';
import Test, { isTestOptions, TestOptions } from '../Test';
import { mixin } from 'dojo-core/lang';
import { Handle } from 'dojo-interfaces/core';
import Task from 'dojo-core/async/Task';
import Formatter from '../Formatter';
import { pullFromArray } from '../util';
import Reporter, { ReporterOptions } from '../reporters/Reporter';
import getObjectInterface, { ObjectInterface } from '../interfaces/object';
import getTddInterface, { TddInterface } from '../interfaces/tdd';
import getBddInterface, { BddInterface } from '../interfaces/bdd';
import global from 'dojo-core/global';

declare global {
	// There will be one active executor
	export let intern: Executor<Events>;
}

export { Handle };

export interface Config {
	args?: { [name: string]: any };
	bail?: boolean;
	baseline?: boolean;
	benchmark?: boolean;
	// benchmarkConfig?: BenchmarkReporterDescriptor;
	defaultTimeout?: number;
	excludeInstrumentation?: true | RegExp;
	filterErrorStack?: boolean;
	formatter?: Formatter;
	grep?: RegExp;
	instrumenterOptions?: any;
	interfaces?: string[];
	maxConcurrency?: number;
	name?: string;
	reporters?: [ string | typeof Reporter | { reporter: string | typeof Reporter, options?: ReporterOptions } ];
	setup?: (executor: Executor<Events>) => Task<any>;
	teardown?: (executor: Executor<Events>) => Task<any>;
}

export interface Listener<T> {
	(arg: T): void | Promise<void>;
}

export interface CoverageMessage {
	sessionId?: string;
	coverage: any;
}

export interface DeprecationMessage {
	original: string;
	replacement: string;
	message?: string;
}

export interface Events {
	newSuite: Suite;
	newTest: Test;
	error: Error;
	testStart: Test;
	testEnd: Test;
	suiteStart: Suite;
	suiteEnd: Suite;
	runStart: never;
	runEnd: never;
	coverage: CoverageMessage;
	deprecated: DeprecationMessage;
};

export interface ExecutorClass<E extends Events, T extends Executor<E>> {
	new (config: Config): T;
	create(this: ExecutorClass<E, T>, config: Config): T;
}

export abstract class Executor<E extends Events> {
	/** The type of the executor. */
	readonly mode: string;

	/** The resolved configuration for this executor. */
	protected _config: Config;

	protected _formatter: Formatter;

	/** The root suites managed by this executor. */
	protected _rootSuites: Suite[];

	protected _hasSuiteErrors = false;

	protected _listeners: { [event: string]: Listener<any>[] };

	protected _reporters: Reporter[];

	constructor(config: Config = {}) {
		this._config = {
			instrumenterOptions: {
				coverageVariable: '__internCoverage'
			},
			defaultTimeout: 30000
		};

		this._listeners = {};
		this._reporters = [];

		if (config) {
			this._configure(config);
		}
	}

	/**
	 * Create a new instance of an Executor and assign it to the global intern reference. This is the method that user
	 * code should generally use to instantiate an executor since it ensures the global reference is created.
	 */
	static create<E extends Events, T extends Executor<E>>(this: ExecutorClass<E, T>, config: Config = {}): T {
		const executor = new this(config);
		global['intern'] = executor;
		return executor;
	}

	get config() {
		return this._config;
	}

	get formatter() {
		if (!this._formatter) {
			if (this.config.formatter) {
				this._formatter = this.config.formatter;
			}
			else {
				this._formatter = new Formatter(this.config);
			}
		}
		return this._formatter;
	}

	protected _configure(config: Config) {
		// config.benchmarkConfig = deepMixin({
		// 	id: 'Benchmark',
		// 	filename: 'baseline.json',
		// 	mode: <BenchmarkMode>'test',
		// 	thresholds: {
		// 		warn: { rme: 3, mean: 5 },
		// 		fail: { rme: 6, mean: 10 }
		// 	},
		// 	verbosity: 0
		// }, config.benchmarkConfig);

		mixin(this._config, config);

		// Process any command line or query args
		if (config.args) {
			const args = config.args;
			if (args['grep']) {
				let grep = /^\/(.*)\/([gim]*)$/.exec(args['grep']);

				if (grep) {
					this.config.grep = new RegExp(grep[1], grep[2]);
				}
				else {
					this.config.grep = new RegExp(args['grep'], 'i');
				}
			}

		}

		if (this.config.grep == null) {
			this.config.grep = new RegExp('');
		}

		if (this.config.reporters) {
			this.config.reporters.forEach(reporter => {
				if (typeof reporter === 'string') {
					const ReporterClass = this._getReporter(reporter);
					this._reporters.push(new ReporterClass(this));
				}
				else if (typeof reporter === 'function') {
					this._reporters.push(new reporter(this));
				}
				else {
					let ReporterClass: typeof Reporter;
					if (typeof reporter.reporter === 'string') {
						ReporterClass = this._getReporter(reporter.reporter);
					}
					else {
						ReporterClass = reporter.reporter;
					}

					this._reporters.push(new ReporterClass(this, reporter.options));
				}
			});
		}
	}

	/**
	 * Emit an event to all registered listeners.
	 */
	emit(eventName: 'runStart'): Task<any>;
	emit(eventName: 'runEnd'): Task<any>;
	emit<T extends keyof E>(eventName: T, data: E[T]): Task<any>;
	emit<T extends keyof E>(eventName: T, data?: E[T]): Task<any> {
		if (eventName === 'suiteEnd' && (<any>data).error) {
			this._hasSuiteErrors = true;
		}

		const listeners = this._listeners[eventName] || [];
		if (listeners.length === 0) {
			// Report an error when no error listeners are registered
			if (eventName === 'error') {
				console.error('ERROR:', this.formatter.format(<any>data));
			}

			return Task.resolve();
		}

		// TODO: Remove Promise.all call once Task.all works
		return Task.resolve(Promise.all(listeners.map(listener => {
			return new Promise<void>(resolve => {
				resolve(listener(data));
			});
		}))).catch(error => {
			console.error(`Error emitting ${eventName}: ${this.formatter.format(error)}`);
		});
	}

	getInterface(name: 'object'): ObjectInterface;
	getInterface(name: 'tdd'): TddInterface;
	getInterface(name: 'bdd'): BddInterface;
	getInterface(name: string): any {
		switch (name) {
			case 'object':
				return getObjectInterface(this);
			case 'tdd':
				return getTddInterface(this);
			case 'bdd':
				return getBddInterface(this);
		}
	}

	/**
	 * Add a listener for a test event. When an event is emitted, the executor will wait for all Promises returned by
	 * listener callbacks to resolve before continuing.
	 */
	on<T extends keyof E>(eventName: T, listener: Listener<E[T]>): Handle {
		let listeners = this._listeners[eventName];
		if (!listeners) {
			listeners = this._listeners[eventName] = [];
		}

		if (listeners.indexOf(listener) === -1) {
			listeners.push(listener);
		}

		const handle: Handle = {
			destroy(this: any) {
				this.destroy = function () { };
				const index = listeners.indexOf(listener);
				if (index !== -1) {
					listeners = listeners.splice(index, 1);
				}
			}
		};
		return handle;
	}

	/**
	 * Add a test or suite of tests.
	 */
	addTest(suiteOrTest: Suite | Test | SuiteOptions | TestOptions) {
		// Check if suiteOrTest is an instance or a simple Object
		if (!(suiteOrTest instanceof Test) && !(suiteOrTest instanceof Suite)) {
			if (isTestOptions(suiteOrTest)) {
				suiteOrTest = new Test(suiteOrTest);
			}
			else if (isSuiteOptions(suiteOrTest)) {
				suiteOrTest = new Suite(suiteOrTest);
			}
			else {
				throw new Error('InvalidTest: argument is not a valid suite or test');
			}
		}
		this._rootSuites.forEach(suite => {
			suite.add(<Suite | Test>suiteOrTest);
		});
	}

	/**
	 * Sets up the environment for test execution with instrumentation, reporting, and error handling. Subclasses
	 * should typically override `_runTests` to execute tests.
	 */
	run(): Task<void> {
		const promise = this._beforeRun()
			.then(() => {
				return Task.resolve(this.config.setup && this.config.setup(this)).then(() => {
					return this.emit('runStart')
						.then(() => this._runTests(this.config.maxConcurrency))
						.finally(() => this.emit('runEnd'));
				})
				.finally(() => Promise.resolve(this.config.teardown && this.config.teardown(this)));
			})
			.finally(() => this._afterRun())
			.then(() => {
				if (this._hasSuiteErrors) {
					throw new Error('One or more suite errors occurred during testing');
				}

				// Return total number of failed tests
				return this._rootSuites.reduce(function (numFailedTests, suite) {
					return numFailedTests + suite.numFailedTests;
				}, 0);
			})
			.catch(error => this.emit('error', error));

		// Only allow the executor to be started once
		this.run = () => promise;

		return promise;
	}

	/**
	 * Code to execute after the main test run has finished to shut down the test system.
	 */
	protected _afterRun() {
		return Promise.resolve();
	}

	/**
	 * Code to execute before the main test run has started to set up the test system.
	 */
	protected _beforeRun() {
		return Task.resolve();
	}

	/**
	 * Return a reporter constructor corresponding to the given name
	 */
	abstract protected _getReporter(_name: string): typeof Reporter;

	/**
	 * Runs each of the root suites, limited to a certain number of suites at the same time by `maxConcurrency`.
	 */
	protected _runTests(maxConcurrency: number) {
		maxConcurrency = maxConcurrency || Infinity;

		const suites = this._rootSuites;
		let numSuitesCompleted = 0;
		const numSuitesToRun = suites.length;
		const queue = createQueue(maxConcurrency);
		let hasError = false;
		const runningSuites: Task<any>[] = [];

		return new Task<any>(
			(resolve, reject) => {
				const emitLocalCoverage = () => {
					const message = 'Run failed due to one or more suite errors';

					const coverageData: Object = global[this.config.instrumenterOptions.coverageVariable];
					if (coverageData) {
						return this.emit('coverage', { coverage: coverageData }).then(() => {
							if (hasError) {
								throw new Error(message);
							}
						});
					}

					if (hasError) {
						return Promise.reject(new Error(message));
					}

					return Promise.resolve();
				};

				function finishSuite() {
					if (++numSuitesCompleted === numSuitesToRun) {
						emitLocalCoverage().then(resolve, error => {
							console.error('errored');
							reject(error);
						});
					}
				}

				if (suites && suites.length) {
					suites.forEach(queue(function (suite: Suite) {
						const runTask = suite.run().then(finishSuite, error => {
							console.error('error:', error);
							hasError = true;
							finishSuite();
						});
						runningSuites.push(runTask);
						runTask.finally(() => {
							pullFromArray(runningSuites, runTask);
						});
						return runTask;
					}));
				}
				else {
					emitLocalCoverage().then(resolve, error => {
						console.error('errored');
						reject(error);
					});
				}
			},
			() => {
				queue.empty();

				let task: Task<any>;
				while ((task = runningSuites.pop())) {
					task.cancel();
				}
			}
		);
	}
}

export default Executor;

interface Queuer {
	(callee: Function): () => void;
	empty?: () => void;
}

/**
 * Creates a basic FIFO function queue to limit the number of currently executing asynchronous functions.
 *
 * @param maxConcurrency Number of functions to execute at once.
 * @returns A function that can be used to push new functions onto the queue.
 */
function createQueue(maxConcurrency: number) {
	let numCalls = 0;
	let queue: any[] = [];

	function shiftQueue() {
		if (queue.length) {
			const callee = queue.shift();
			Task.resolve(callee[0].apply(callee[1], callee[2])).finally(shiftQueue);
		}
		else {
			--numCalls;
		}
	}

	// Returns a function to wrap callback function in this queue
	let queuer: Queuer = function (callee: Function) {
		// Calling the wrapped function either executes immediately if possible,
		// or pushes onto the queue if not
		return function (this: any) {
			if (numCalls < maxConcurrency) {
				++numCalls;
				Task.resolve(callee.apply(this, arguments)).finally(shiftQueue);
			}
			else {
				queue.push([ callee, this, arguments ]);
			}
		};
	};

	queuer.empty = function () {
		queue = [];
		numCalls = 0;
	};

	return queuer;
}
