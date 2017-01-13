import { Config } from '../../common';
import Suite, { isSuiteOptions, SuiteOptions } from '../Suite';
import Test, { isTestOptions, TestOptions } from '../Test';
import { mixin } from 'dojo-core/lang';
import Task from 'dojo-core/async/Task';
import Reporter from '../reporters/Reporter';
import Formatter from '../Formatter';
import { pullFromArray } from '../util';
import global from 'dojo-core/global';

export interface Listener {
	(...args: any[]): void | Promise<void>;
}

export interface Handle {
	remove(): (void | Promise<void>);
}

export interface CoverageMessage {
	sessionId?: string;
	coverage: any;
}

export default class Executor {
	/** The resolved configuration for this executor. */
	readonly config: Config;

	/** The type of the executor. */
	readonly mode: string;

	protected _formatter: Formatter;

	/** The root suites managed by this executor. */
	protected _rootSuites: Suite[];

	protected _hasSuiteErrors = false;

	protected _listeners: { [event: string]: Listener[] };

	protected _reporters: Reporter[];

	constructor(config: Config) {
		this.config = mixin({
			instrumenterOptions: {
				coverageVariable: '__internCoverage'
			},
			defaultTimeout: 30000,
			reporters: [],
			grep: new RegExp('')
		}, config);

		this._listeners = {};
		this._reporters = [];

		this.config.reporters.forEach(reporter => {
			this.addReporter(reporter);
		});
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

	/**
	 * Emit an event to all registered listeners.
	 */
	emit(eventName: 'newSuite', data: Suite): Task<any>;
	emit(eventName: 'newTest', data: Test): Task<any>;
	emit(eventName: 'runStart'): Task<any>;
	emit(eventName: 'suiteStart', data: Suite): Task<any>;
	emit(eventName: 'suiteError', data: Suite): Task<any>;
	emit(eventName: 'testStart', data: Test): Task<any>;
	emit(eventName: 'testEnd', data: Test): Task<any>;
	emit(eventName: 'suiteEnd', data: Suite): Task<any>;
	emit(eventName: 'coverage', data: CoverageMessage): Task<any>;
	emit(eventName: 'runEnd'): Task<any>;
	emit(eventName: 'error', data: Error): Task<any>;
	emit(eventName: string, data?: any): Task<any> {
		if (eventName === 'suiteEnd' && data.error) {
			this._hasSuiteErrors = true;
		}

		const listeners = this._listeners[eventName] || [];
		const reporters = this._reporters.filter(reporter => {
			return typeof (<any>reporter)[eventName] === 'function';
		});

		if (listeners.length === 0 && reporters.length === 0) {
			// Report an error when no error listeners are registered
			if (eventName === 'error') {
				console.log('ERROR:', this.formatter.format(data));
			}

			return Task.resolve();
		}

		// TODO: Remove Promise.all call once Task.all works
		return Task.resolve(Promise.all(listeners.map(listener => {
			return new Promise<void>(resolve => {
				resolve(listener(data));
			});
		}).concat(reporters.map(reporter => {
			return new Promise<void>(resolve => {
				resolve((<any>reporter)[eventName](data));
			});
		})))).catch(error => {
			console.log(`Error emitting ${eventName}: ${this.formatter.format(error)}`);
		});
	}

	/**
	 * Add a listener for a test event. When an event is emitted, the executor
	 * will wait for all Promises returned by listener callbacks to resolve
	 * before continuing.
	 */
	on(eventName: string, listener: Listener) {
		let listeners = this._listeners[eventName];
		if (!listeners) {
			listeners = this._listeners[eventName] = [];
		}

		if (listeners.indexOf(listener) === -1) {
			listeners.push(listener);
		}

		const handle: Handle = {
			remove(this: any) {
				this.remove = function () { };
				const index = listeners.indexOf(listener);
				if (index !== -1) {
					listeners = listeners.splice(index, 1);
				}
			}
		};
		return handle;
	}

	/**
	 * Add a reporter.
	 */
	addReporter(reporter: Reporter) {
		if (this._reporters.indexOf(reporter) !== -1) {
			return;
		}
		reporter.executor = this;
		this._reporters.push(reporter);
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
	run() {
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
		this.run = function () {
			return promise;
		};

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
					let error = new Error('Run failed due to one or more suite errors');

					let coverageData: Object = global[this.config.instrumenterOptions.coverageVariable];
					if (coverageData) {
						return this.emit('coverage', { coverage: coverageData }).then(() => {
							if (hasError) {
								throw error;
							}
						});
					}
					else if (hasError) {
						return Promise.reject(error);
					}
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

	(<any> queuer).empty = function () {
		queue = [];
		numCalls = 0;
	};

	return queuer;
}
