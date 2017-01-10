import ReporterManager from '../ReporterManager';
import { Config } from '../../common';
import Suite from '../Suite';
import * as util from '../util';
import * as lang from 'dojo/lang';
import * as Promise from 'dojo/Promise';

// Legacy imports
import * as intern from '../../main';

const globalOrWindow = Function('return this')();

export default class Executor {
	/** The resolved configuration for this executor. */
	config: Config;

	/** The type of the executor. */
	mode: string;

	/** The reporter manager for this test execution. */
	reporterManager: ReporterManager;

	/** The root suites managed by this executor. */
	suites: Suite[];

	protected _hasSuiteErrors = false;

	constructor(config: Config) {
		this.config = lang.deepMixin({
			instrumenterOptions: {
				coverageVariable: '__internCoverage'
			},
			defaultTimeout: 30000,
			reporters: []
		}, config);
	}

	/**
	 * Enables instrumentation for all code loaded into the current environment.
	 *
	 * @param basePath The base path to use to calculate absolute paths for use by lcov.
	 * @param excludePaths A regular expression matching paths, relative to `basePath`, that should not be
	 * instrumented.
	 * @param instrumenterOptions Extra options for the instrumenter
	 */
	enableInstrumentation(_basePath: string, _excludePaths: RegExp, _instrumenterOptions: { [key: string]: string }) {
		// Does nothing by default
	}

	/**
	 * Register tests on the root suites.
	 */
	register(callback: (suite: Suite) => void) {
		this.suites.forEach(callback);
	}

	/**
	 * Sets up the environment for test execution with instrumentation, reporting, and error handling. Subclasses
	 * should typically override `_runTests` to execute tests.
	 */
	run() {
		const emitFatalError = (error: Error) => this._handleError(error).then(function () {
			throw error;
		});

		const emitRunEnd = () => this.reporterManager.emit('runEnd', this);
		const emitRunStart = () => this.reporterManager.emit('runStart', this);
		const runConfigSetup = () => Promise.resolve(this.config.setup && this.config.setup(this));
		const runConfigTeardown = () => Promise.resolve(this.config.teardown && this.config.teardown(this));
		const runTests = () => this._runTests(this.config.maxConcurrency);

		const promise = this._beforeRun()
			.then(function () {
				return runConfigSetup().then(function () {
					return emitRunStart()
						.then(runTests)
						.finally(emitRunEnd);
				})
					.finally(runConfigTeardown);
			})
			.finally(() => {
				return this._afterRun();
			})
			.then(() => {
				if (this._hasSuiteErrors) {
					throw new Error('One or more suite errors occurred during testing');
				}

				return this.suites.reduce(function (numFailedTests, suite) {
					return numFailedTests + suite.numFailedTests;
				}, 0);
			})
			.catch(emitFatalError);

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
		const self = this;
		intern.setExecutor(this);
		const config = this.config;

		function enableInstrumentation() {
			if (config.excludeInstrumentation !== true) {
				return self.enableInstrumentation(
					config.basePath,
					(<RegExp>config.excludeInstrumentation),
					config.instrumenterOptions
				);
			}
		}

		function registerErrorHandler() {
			self.reporterManager.on('suiteError', function () {
				self._hasSuiteErrors = true;
			});
		}

		return Promise.resolve(registerErrorHandler())
			.then(enableInstrumentation);
	}

	/**
	 * The error handler for fatal errors (uncaught exceptions and errors within the test system itself).
	 *
	 * @returns A promise that resolves once the error has been sent to all registered error handlers.
	 */
	protected _handleError(error: Error) {
		return Promise.resolve(this.reporterManager && this.reporterManager.emit('fatalError', error));
	}

	/**
	 * Runs each of the root suites, limited to a certain number of suites at the same time by `maxConcurrency`.
	 */
	protected _runTests(maxConcurrency: number) {
		maxConcurrency = maxConcurrency || Infinity;

		const self = this;
		const suites = this.suites;
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
					return self.reporterManager.emit('coverage', null, coverageData).then(function () {
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
					let runTask = suite.run().then(finishSuite, function () {
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
