import { Config } from '../../common';
import Suite from '../Suite';
import Test from '../Test';
import * as util from '../util';
import * as lang from 'dojo/lang';
import Promise = require('dojo/Promise');
import Reporter from '../reporters/Reporter';
import { getErrorMessage } from '../node/util';

// Legacy imports
import * as intern from '../../main';

const globalOrWindow = Function('return this')();

export interface Listener {
	(...args: any[]): void | Promise<void>;
}

export interface Handle {
	remove(): (void | Promise<void>);
}

abstract class Executor {
	/** The resolved configuration for this executor. */
	config: Config;

	/** The type of the executor. */
	mode: string;

	/** The root suites managed by this executor. */
	protected _rootSuites: Suite[];

	protected _hasSuiteErrors = false;

	protected _listeners: { [event: string]: Listener[] };

	protected _reporters: Reporter[];

	constructor(config: Config) {
		this.config = lang.deepMixin({
			instrumenterOptions: {
				coverageVariable: '__internCoverage'
			},
			defaultTimeout: 30000,
			reporters: []
		}, config);

		this._listeners = {};
		this._reporters = [];
	}

	/**
	 * Emit an event to all registered listeners.
	 */
	emit(eventName: 'newSuite', data: Suite): Promise<any>;
	emit(eventName: 'newTest', data: Test): Promise<any>;
	emit(eventName: 'runStart'): Promise<any>;
	emit(eventName: 'suiteStart', data: Suite): Promise<any>;
	emit(eventName: 'suiteError', data: Suite): Promise<any>;
	emit(eventName: 'testStart', data: Test): Promise<any>;
	emit(eventName: 'testEnd', data: Test): Promise<any>;
	emit(eventName: 'suiteEnd', data: Suite): Promise<any>;
	emit(eventName: 'coverage', data: any): Promise<any>;
	emit(eventName: 'runEnd'): Promise<any>;
	emit(eventName: 'error', data: Error): Promise<any>;
	emit(eventName: string, data?: any): Promise<any> {
		if (eventName === 'suiteError') {
			this._hasSuiteErrors = true;
		}

		const listeners = this._listeners[eventName] || [];
		const reporters = this._reporters.filter(reporter => {
			return typeof (<any>reporter)[eventName] === 'function';
		});

		if (listeners.length === 0 && reporters.length === 0) {
			// Report an error when no error listeners are registered
			if (eventName === 'error') {
				console.error('ERROR:', getErrorMessage(data));
			}

			return Promise.resolve();
		}

		return Promise.all(listeners.map(listener => {
			return listener(data);
		}).concat(reporters.map(reporter => {
			return (<any>reporter)[eventName](data);
		})));
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
		this._reporters.push(reporter);
	}

	/**
	 * Add a test or suite of tests.
	 */
	addTest(suiteOrTest: Suite | Test) {
		this._rootSuites.forEach(suite => {
			suite.add(suiteOrTest);
		});
	}

	/**
	 * Sets up the environment for test execution with instrumentation, reporting, and error handling. Subclasses
	 * should typically override `_runTests` to execute tests.
	 */
	run() {
		const emitRunEnd = () => this.emit('runEnd');
		const emitRunStart = () => this.emit('runStart');
		const runConfigSetup = () => Promise.resolve(this.config.setup && this.config.setup(this));
		const runConfigTeardown = () => Promise.resolve(this.config.teardown && this.config.teardown(this));
		const runTests = () => this._runTests(this.config.maxConcurrency);

		const promise = this._beforeRun()
			.then(() => {
				return runConfigSetup().then(function () {
					return emitRunStart()
						.then(runTests)
						.finally(emitRunEnd);
				})
				.finally(runConfigTeardown);
			})
			.finally(() => this._afterRun())
			.then(() => {
				if (this._hasSuiteErrors) {
					throw new Error('One or more suite errors occurred during testing');
				}

				return this._rootSuites.reduce(function (numFailedTests, suite) {
					return numFailedTests + suite.numFailedTests;
				}, 0);
			})
			.catch(error => this.emit('error', error));

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
		intern.setExecutor(this);
		return Promise.resolve();
	}

	/**
	 * Runs each of the root suites, limited to a certain number of suites at the same time by `maxConcurrency`.
	 */
	protected _runTests(maxConcurrency: number) {
		maxConcurrency = maxConcurrency || Infinity;

		const self = this;
		const suites = this._rootSuites;
		let numSuitesCompleted = 0;
		const numSuitesToRun = suites.length;
		const queue = util.createQueue(maxConcurrency);
		let hasError = false;

		return new Promise(function (resolve, _reject, _progress, setCanceler) {
			const runningSuites: Promise<any>[] = [];

			setCanceler(function (reason) {
				queue.empty();

				let cancellations: any[] = [];
				let task: Promise<any>;
				while ((task = runningSuites.pop())) {
					cancellations.push(task.cancel && task.cancel(reason));
				}

				return Promise.all(cancellations).then(function () {
					throw reason;
				});
			});

			function emitLocalCoverage() {
				let error = new Error('Run failed due to one or more suite errors');

				let coverageData = globalOrWindow[self.config.instrumenterOptions.coverageVariable];
				if (coverageData) {
					return self.emit('coverage', coverageData).then(function () {
						if (hasError) {
							throw error;
						}
					});
				}
				else if (hasError) {
					return Promise.reject(error);
				}
			}

			function finishSuite() {
				if (++numSuitesCompleted === numSuitesToRun) {
					resolve(emitLocalCoverage());
				}
			}

			if (suites && suites.length) {
				suites.forEach(queue(function (suite: Suite) {
					let runTask = suite.run().then(finishSuite, function (error) {
						console.error('error:', error);
						hasError = true;
						finishSuite();
					});
					runningSuites.push(runTask);
					runTask.finally(function () {
						lang.pullFromArray(runningSuites, runTask);
					});
					return runTask;
				}));
			}
			else {
				resolve(emitLocalCoverage());
			}
		});
	}
}

export default Executor;
