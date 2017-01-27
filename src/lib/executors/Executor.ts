import Suite, { isSuiteOptions, SuiteOptions } from '../Suite';
import Test, { isTestOptions, TestOptions } from '../Test';
import { deepMixin } from 'dojo-core/lang';
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
	reporters?: (string | typeof Reporter | { reporter: string | typeof Reporter, options?: ReporterOptions })[];
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
	replacement?: string;
	message?: string;
}

export interface Events {
	'*': any;
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

	protected _interfaces: { [name: string]: any };

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
		this._interfaces = {};

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

		if (config) {
			this.configure(config);
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

	/**
	 * Update this executor's configuration with a Config object or a general args object.
	 *
	 * Note that non-object properties will replace existing properties. Object propery values will be deeply mixed into
	 * any existing value.
	 */
	configure(config: Config | {[key in keyof Config]: string | string[] | true }) {
		Object.keys(config).forEach((key: keyof Config) => {
			this._processArgument(key, config[key]);
		});
	}

	/**
	 * Emit an event to all registered listeners.
	 *
	 * This method handles async listeners. Note that this method will always resolve (never reject).
	 */
	emit(eventName: 'runStart'): Task<any>;
	emit(eventName: 'runEnd'): Task<any>;
	emit<T extends keyof E>(eventName: T, data: E[T]): Task<any>;
	emit<T extends keyof E>(eventName: T, data?: E[T]): Task<any> {
		if (eventName === 'suiteEnd' && (<any>data).error) {
			this._hasSuiteErrors = true;
		}

		const listeners = (this._listeners[eventName] || []).concat(this._listeners['*'] || []);
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

	/**
	 * Return a testing interface
	 */
	getInterface(name: 'object'): ObjectInterface;
	getInterface(name: 'tdd'): TddInterface;
	getInterface(name: 'bdd'): BddInterface;
	getInterface(name: string): any;
	getInterface(name: string): any {
		switch (name) {
			case 'object':
				if (!this._interfaces['object']) {
					this._interfaces['object'] = getObjectInterface(this);
				}
			case 'tdd':
				if (!this._interfaces['tdd']) {
					this._interfaces['tdd'] = getTddInterface(this);
				}
				break;
			case 'bdd':
				if (!this._interfaces['bdd']) {
					this._interfaces['bdd'] = getBddInterface(this);
				}
				break;
		}
		return this._interfaces[name];
	}

	/**
	 * Register a testing interface on this executor. A testing interface can be anything that will allow a test to
	 * register tests on the executor. For example, the 'object' interface is a single method, `registerSuite`, that a
	 * test can call to register a suite.
	 */
	setInterface(name: string, iface: any) {
		this._interfaces[name] = iface;
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
				pullFromArray(listeners, listener);
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
						.then(() => this._runTests())
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
		return Task.resolve();
	}

	/**
	 * Code to execute before the main test run has started to set up the test system. This is where Executors can do
	 * any last-minute configuration before the testing process begins.
	 */
	protected _beforeRun(): Task<any> {
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

		return Task.resolve();
	}

	/**
	 * Return a reporter constructor corresponding to the given name
	 */
	protected abstract _getReporter(_name: string): typeof Reporter;

	/**
	 * Process an arbitrary config value. Subclasses can override this method to pre-process arguments or handle them
	 * instead of allowing Executor to.
	 */
	protected _processArgument(name: keyof Config, value: any) {
		switch (name) {
			// boolean
			case 'bail':
			case 'baseline':
			case 'benchmark':
			case 'filterErrorStack':
				if (typeof value === 'boolean') {
					this.config[name] = value;
				}
				else if (value === 'true') {
					this.config[name] = true;
				}
				else if (value === 'false') {
					this.config[name] = false;
				}
				else {
					throw new Error(`Non-boolean value "${value}" for ${name}`);
				}
				break;

			// number
			case 'defaultTimeout':
			case 'maxConcurrency':
				const numValue = Number(value);
				if (isNaN(numValue)) {
					throw new Error(`Non-numeric value "${value}" for ${name}`);
				}
				this.config[name] = numValue;
				break;

			// RegExp or true
			case 'excludeInstrumentation':
				if (value === true) {
					this.config[name] = value;
				}
				else if (typeof value === 'string') {
					this.config[name] = new RegExp(value);
				}
				else {
					throw new Error(`Invalid numeric value "${value}" for ${name}`);
				}
				break;

			// RegExp or string
			case 'grep':
				if (typeof value === 'string') {
					this.config[name] = new RegExp(value);
				}
				else if (value instanceof RegExp) {
					this.config[name] = value;
				}
				else {
					throw new Error(`Invalid value "${value}" for ${name}`);
				}
				break;

			// object
			case 'instrumenterOptions':
				if (typeof value === 'string') {
					value = JSON.parse(value);
				}
				else if (typeof value !== 'object') {
					throw new Error(`Invalid value "${value}" for ${name}`);
				}
				this.config[name] = deepMixin(this.config[name] || {}, value);
				break;

			// array of (string | object)
			case 'reporters':
				this.config[name] = (Array.isArray(value) ? value : [value]).map(reporter => {
					if (typeof reporter === 'string') {
						try {
							return JSON.parse(reporter);
						}
						catch (_error) {
							return reporter;
						}
					}
					else if (typeof reporter === 'object') {
						return reporter;
					}
					else {
						throw new Error(`Invalid value "${value}" for ${name}`);
					}
				});
				break;

			// string
			case 'name':
				if (typeof value !== 'string') {
					throw new Error(`Non-string value "${value}" for ${name}`);
				}
				this.config[name] = value;
				break;

			// array of strings
			case 'interfaces':
				this.config[name] = (Array.isArray(value) ? value : [value]).map(value => {
					if (typeof value !== 'string') {
						throw new Error(`Non-string value "${value}" for ${name}`);
					}
					return value;
				});
				break;
		}
	}

	/**
	 * Runs each of the root suites, limited to a certain number of suites at the same time by `maxConcurrency`.
	 */
	protected _runTests() {
		const queue = new FunctionQueue(this.config.maxConcurrency || Infinity);
		const rootSuites = this._rootSuites;
		const numSuitesToRun = rootSuites.length;
		let numSuitesCompleted = 0;
		let hasError = false;

		let suiteTasks = rootSuites.map(suite => {
			return queue.enqueue(() => {
				return suite.run().catch(error => {
					console.error('error:', error);
					hasError = true;
				}).finally(() => {
					numSuitesCompleted++;
					if (numSuitesCompleted === numSuitesToRun) {
						const message = 'Run failed due to one or more suite errors';
						const coverage = global[this.config.instrumenterOptions.coverageVariable];
						if (coverage) {
							return this.emit('coverage', { coverage }).then(() => {
								if (hasError) {
									throw new Error(message);
								}
							});
						}

						if (hasError) {
							throw new Error(message);
						}
					}
				});
			});
		});

		return Task.resolve(suiteTasks);
	}
}

export default Executor;

/**
 * A basic FIFO function queue to limit the number of currently executing asynchronous functions.
 */
class FunctionQueue {
	readonly maxConcurrency: number;
	queue: any[];
	activeTasks: Task<any>[];
	funcTasks: Task<any>[];

	constructor(maxConcurrency: number) {
		this.maxConcurrency = maxConcurrency;
		this.queue = [];
		this.activeTasks = [];
		this.funcTasks = [];
	}

	enqueue(func: () => Task<any>) {
		let resolver: (value?: any) => void;
		let rejecter: (error?: Error) => void;

		const funcTask = new Task((resolve, reject) => {
			resolver = resolve;
			rejecter = reject;
		});
		this.funcTasks.push(funcTask);

		this.queue.push({ func, resolver, rejecter });
		if (this.activeTasks.length < this.maxConcurrency) {
			this.next();
		}

		return funcTask;
	}

	clear() {
		this.activeTasks.forEach(task => task.cancel());
		this.funcTasks.forEach(task => task.cancel());
		this.activeTasks = [];
		this.funcTasks = [];
		this.queue = [];
	}

	next() {
		if (this.queue.length > 0) {
			const { func, resolver, rejecter } = this.queue.shift();
			const task = func().then(resolver, rejecter).finally(() => {
				// Remove the task from the active task list and kick off the next task
				pullFromArray(this.activeTasks, task);
				this.next();
			});
			this.activeTasks.push(task);
		}
	}
}
