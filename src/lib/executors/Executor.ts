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
import * as chai from 'chai';
import global from 'dojo-core/global';

export abstract class GenericExecutor<E extends Events, C extends Config> {
	/** The resolved configuration for this executor. */
	protected _config: C;

	protected _formatter: Formatter;

	/**
	 * The root suites managed by this executor. Currently only the WebDriver executor will have more than one root
	 * suite.
	 */
	protected _rootSuite: Suite;

	protected _hasSuiteErrors = false;

	protected _interfaces: { [name: string]: any };

	protected _listeners: { [event: string]: Listener<any>[] };

	protected _reporters: Reporter[];

	protected _runTask: Task<void>;

	constructor(config: C) {
		this._config = <C>{
			instrumenterOptions: {
				coverageVariable: '__internCoverage'
			},
			defaultTimeout: 30000,
			excludeInstrumentation: /(?:node_modules|browser|tests)\//
		};

		this._listeners = {};
		this._reporters = [];
		this._interfaces = {};

		if (config) {
			this.configure(config);
		}

		this._rootSuite = new Suite({
			executor: this,
			name: this.config.name
		});
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
	 * Load a script or scripts. This is a convenience method for loading and evaluating simple scripts, not modules. If
	 * multiple script paths are provided, scripts will be loaded sequentially in the order given.
	 *
	 * @param script a path to a script
	 */
	abstract loadScript(script: string | string[]): Task<void>;

	/**
	 * Load a text resource. This is a convenience method that will use an environment-specific method to load the text
	 * (e.g., fs.readFile or XHR).
	 *
	 * @param resource a path to a text resource
	 */
	abstract loadText(resource: string): Task<string>;
	abstract loadText(resource: string[]): Task<string[]>;

	/**
	 * Add a test or suite of tests to the set of tests that will be run when `run` is called.
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
		this._rootSuite.add(<Suite | Test>suiteOrTest);
	}

	/**
	 * Update this executor's configuration with a Config object.
	 *
	 * Note that non-object properties will replace existing properties. Object propery values will be deeply mixed into
	 * any existing value.
	 */
	configure(config: C | {[key in keyof Config]: string | string[] | true }) {
		Object.keys(config).forEach((key: keyof Config) => {
			this._processOption(key, config[key]);
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

		const notifications: Promise<any>[] = [];

		(this._listeners[eventName] || []).forEach(listener => {
			notifications.push(Promise.resolve(listener(data)));
		});

		const starListeners = this._listeners['*'] || [];
		if (starListeners.length > 0) {
			const starEvent = { name: eventName, data };
			starListeners.forEach(listener => {
				notifications.push(Promise.resolve(listener(starEvent)));
			});
		}

		if (notifications.length === 0) {
			// Report an error when no error listeners are registered
			if (eventName === 'error') {
				console.error('ERROR:', this.formatter.format(<any>data));
			}

			return Task.resolve();
		}

		// TODO: Remove Promise.all call once Task.all works
		return Task.resolve(Promise.all(notifications)).catch(error => {
			console.error(`Error emitting ${eventName}: ${this.formatter.format(error)}`);
		});
	}

	getAssertions(name: 'chai'): Chai.ChaiStatic;
	getAssertions(name: 'assert'): Chai.AssertStatic;
	getAssertions(name: 'expect'): Chai.ExpectStatic;
	getAssertions(name: 'should'): Chai.Should;
	getAssertions(name: string): any {
		switch (name) {
			case 'chai':
				return chai;
			case 'assert':
				return chai.assert;
			case 'expect':
				return chai.expect;
			case 'should':
				return chai.should();
			default:
				throw new Error(`Invalid assertion name ${name}`);
		}
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
	 * Convenience method for emitting log events
	 */
	log(...args: any[]) {
		if (this.config.debug) {
			const message = args.map(arg => {
				const type = typeof arg;
				if (type === 'string') {
					return arg;
				}
				if (type === 'function' || arg instanceof RegExp) {
					return arg.toString();
				}
				if (arg instanceof Error) {
					arg = { name: arg.name, message: arg.message, stack: arg.stack };
				}
				return JSON.stringify(arg);
			}).join(' ');
			this.emit('log', message);
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
				pullFromArray(listeners, listener);
			}
		};
		return handle;
	}

	/**
	 * Run tests. This method sets up the environment for test execution, runs the tests, and runs any finalization code
	 * afterwards. Subclasses should override `_beforeRun`, `_runTests`, and `_afterRun` to alter how tests are run.
	 */
	run() {
		// Only allow the executor to be started once
		if (!this._runTask) {
			try {
				this._runTask = this._beforeRun()
					.then(() => this.emit('runStart'))
					.then(() => this._runTests())
					.finally(() => this.emit('runEnd'))
					.finally(() => this._afterRun())
					.then(() => {
						if (this._hasSuiteErrors) {
							throw new Error('One or more suite errors occurred during testing');
						}
					})
					.catch(error => {
						this.emit('error', error);
						throw error;
					});
			}
			catch (error) {
				this._runTask = this.emit('error', error).then(() => {
					return Promise.reject(error);
				});
			}
		}

		return this._runTask;
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
		const config = this.config;

		if (config.grep == null) {
			config.grep = new RegExp('');
		}

		if (config.reporters) {
			config.reporters.forEach(reporter => {
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

		if (config.benchmark) {
			config.benchmarkConfig = deepMixin({
				id: 'Benchmark',
				filename: 'baseline.json',
				mode: 'test',
				thresholds: {
					warn: { rme: 3, mean: 5 },
					fail: { rme: 6, mean: 10 }
				},
				verbosity: 0
			}, config.benchmarkConfig);
		}

		return Task.resolve();
	}

	protected _emitCoverage(coverage: any) {
		return this.emit('coverage', { coverage });
	}

	/**
	 * Return a reporter constructor corresponding to the given name
	 */
	protected abstract _getReporter(_name: string): typeof Reporter;

	/**
	 * Process an arbitrary config value. Subclasses can override this method to pre-process arguments or handle them
	 * instead of allowing Executor to.
	 */
	protected _processOption(name: keyof Config, value: any) {
		switch (name) {
			// boolean
			case 'bail':
			case 'baseline':
			case 'benchmark':
			case 'debug':
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
				else if (value instanceof RegExp) {
					this.config[name] = value;
				}
				else {
					throw new Error(`Invalid value "${value}" for ${name}; must be (string | RegExp | true)`);
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

			default:
				throw new Error(`Unknown config property "${name}"`);
		}
	}

	/**
	 * Runs each of the root suites, limited to a certain number of suites at the same time by `maxConcurrency`.
	 */
	protected _runTests() {
		return this._rootSuite.run().finally(() => {
			const coverage = global[this.config.instrumenterOptions.coverageVariable];
			if (coverage) {
				return this._emitCoverage(coverage);
			}
		});
	}
}

export function initialize<E extends Events, C extends Config, T extends GenericExecutor<E, C>>(
	ExecutorClass: ExecutorConstructor<E, C, T>,
	config?: C
): T {
	if (global['intern']) {
		throw new Error('Intern has already been initialized in this environment');
	}
	const executor = new ExecutorClass(config);
	global.intern = executor;
	return executor;
}

export abstract class Executor extends GenericExecutor<Events, Config> {}
export default Executor;

export interface ExecutorConstructor<E extends Events, C extends Config, T extends GenericExecutor<E, C>> {
	new (config: C): T;
}

export { Handle };

export interface Config {
	bail?: boolean;
	baseline?: boolean;
	benchmark?: boolean;
	benchmarkConfig?: {
		id: string;
		filename: string;
		mode: 'test' | 'baseline',
		thresholds: {
			warn: { rme: number, mean: number },
			fail: { rme: number, mean: number }
		};
		verbosity: number;
	};
	debug?: boolean;
	defaultTimeout?: number;
	excludeInstrumentation?: true | RegExp;
	filterErrorStack?: boolean;
	formatter?: Formatter;
	grep?: RegExp;
	instrumenterOptions?: any;
	interfaces?: string[];
	name?: string;
	reporters?: (string | typeof Reporter | { reporter: string | typeof Reporter, options?: ReporterOptions })[];
	setup?: (executor: Executor) => Task<any>;
	teardown?: (executor: Executor) => Task<any>;
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

export interface ExecutorEvent {
	name: string;
	data: any;
}

export interface Events {
	'*': ExecutorEvent;
	coverage: CoverageMessage;
	deprecated: DeprecationMessage;
	error: Error;
	log: string;
	newSuite: Suite;
	newTest: Test;
	runEnd: never;
	runStart: never;
	suiteEnd: Suite;
	suiteStart: Suite;
	testEnd: Test;
	testStart: Test;
};
