import Suite, { isSuiteOptions, SuiteOptions } from '../Suite';
import Test, { isTestOptions, TestOptions } from '../Test';
import { deepMixin } from 'dojo-core/lang';
import { Handle } from 'dojo-interfaces/core';
import Task from 'dojo-core/async/Task';
import Formatter from '../Formatter';
import { parseValue, pullFromArray } from '../util';
import Reporter, { ReporterOptions } from '../reporters/Reporter';
import getObjectInterface, { ObjectInterface } from '../interfaces/object';
import getTddInterface, { TddInterface } from '../interfaces/tdd';
import getBddInterface, { BddInterface } from '../interfaces/bdd';
import * as chai from 'chai';
import global from 'dojo-core/global';

export abstract class GenericExecutor<E extends Events, C extends Config> {
	protected _availableReporters: { [name: string]: typeof Reporter };

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

	protected _loaders: Loader[];

	protected _listeners: { [event: string]: Listener<any>[] };

	protected _reporters: Reporter[];

	protected _runTask: Task<void>;

	constructor(config: C) {
		this._config = <C>{
			instrumenterOptions: {
				coverageVariable: '__internCoverage'
			},
			defaultTimeout: 30000,
			excludeInstrumentation: /(?:node_modules|browser|tests)\//,
			reporters: []
		};

		this._availableReporters = {};
		this._listeners = {};
		this._reporters = [];
		this._interfaces = {};
		this._loaders = [];

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
			this._formatter = new Formatter(this.config);
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

		return Task.all(notifications).catch(error => {
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
	 * Register a loader script that will be loaded at the beginning of the testing process
	 */
	registerLoader(loader: Loader) {
		this._loaders.push(loader);
	}

	/**
	 * Install a reporter constructor
	 */
	registerReporter(name: string, Class: typeof Reporter) {
		this._availableReporters[name] = Class;
	}

	/**
	 * Run tests. This method sets up the environment for test execution, runs the tests, and runs any finalization code
	 * afterwards. Subclasses should override `_beforeRun`, `_runTests`, and `_afterRun` to alter how tests are run.
	 */
	run() {
		// Only allow the executor to be started once
		if (!this._runTask) {
			try {
				this._runTask = this._runLoaders()
					.then(() => this._beforeRun())
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
					return Task.reject<void>(error);
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
	protected _getReporter(name: string): typeof Reporter {
		return this._availableReporters[name];
	}

	/**
	 * Process an arbitrary config value. Subclasses can override this method to pre-process arguments or handle them
	 * instead of allowing Executor to.
	 */
	protected _processOption(name: keyof Config, value: any) {
		switch (name) {
			case 'basePath':
				let parsed = parseValue(name, value, 'string');
				if (parsed[parsed.length - 1] !== '/') {
					parsed += '/';
				}
				this.config[name] = parsed;
				break;

			case 'loader':
				value = parseValue(name, value, 'object|string');
				if (typeof value === 'string') {
					value = { script: value };
				}
				this.config[name] = value;
				break;

			case 'bail':
			case 'baseline':
			case 'benchmark':
			case 'debug':
			case 'filterErrorStack':
				this.config[name] = parseValue(name, value, 'boolean');
				break;

			case 'defaultTimeout':
				this.config[name] = parseValue(name, value, 'number');
				break;

			case 'excludeInstrumentation':
				if (value === true) {
					this.config[name] = value;
				}
				else if (typeof value === 'string' || value instanceof RegExp) {
					this.config[name] = parseValue(name, value, 'regexp');
				}
				else {
					throw new Error(`Invalid value "${value}" for ${name}; must be (string | RegExp | true)`);
				}
				break;

			case 'grep':
				this.config[name] = parseValue(name, value, 'regexp');
				break;

			case 'instrumenterOptions':
				this.config[name] = deepMixin(this.config[name] || {}, parseValue(name, value, 'object'));
				break;

			case 'reporters':
				this.config[name] = (Array.isArray(value) ? value : [value]).map(reporter => {
					if (typeof reporter === 'string') {
						try {
							reporter = JSON.parse(reporter);
						}
						catch (error) {
							// ignore
						}
						return reporter;
					}
					if (typeof reporter === 'object') {
						return reporter;
					}
					throw new Error('Reporter must be a string or object');
				});
				break;

			case 'name':
				this.config[name] = parseValue(name, value, 'string');
				break;

			case 'suites':
				this.config[name] = parseValue(name, value, 'string[]');
				break;

			default:
				this.config[name] = value;
		}
	}

	/**
	 * Run any registered loader callbacks
	 */
	protected _runLoaders() {
		return this._loaders.reduce((previous, loader) => {
			this.log('Running loader with', this.config);
			return previous.then(() => Task.resolve(loader(this.config)));
		}, Task.resolve());
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
	/** If true, Intern will exit as soon as any test fails. */
	bail?: boolean;

	baseline?: boolean;

	/** This is the base path added to any relative paths. It defaults to `process.cwd()` or `/`. */
	basePath?: string;

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

	/** If true, emit and display debug messages. */
	debug?: boolean;

	/** The default timeout for async tests, in ms. */
	defaultTimeout?: number;

	/** A regexp matching file names that shouldn't be instrumented, or `true` to disable instrumentation. */
	excludeInstrumentation?: true | RegExp;

	/** If true, filter external library calls and runtime calls out of error stacks. */
	filterErrorStack?: boolean;

	/** A regexp matching tests that should be run. It defaults to `/./` (which matches everything). */
	grep?: RegExp;

	instrumenterOptions?: any;

	/** A path to a loader script, or an object with a `script` property and an option `config` property. */
	loader?: { script: string, config?: { [key: string]: any } };

	/** A top-level name for this configuration. */
	name?: string;

	/**
	 * A list of reporter names or descriptors. These reporters will be loaded and instantiated before testing begins.
	 */
	reporters?: (string | typeof Reporter | { reporter: string | typeof Reporter, options?: ReporterOptions })[];

	/** A list of paths to suite scripts (or some other suite identifier usable by the suite loader). */
	suites?: string[];

	[key: string]: any;
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

/**
 * A loader callback. Intern doesn't care what the method returns, but it will wait for it to resolve if a Promise is
 * returned.
 */
export interface Loader {
	(config: { [key: string]: any }): Promise<any> | any;
}
