import Suite, { isSuiteOptions, SuiteOptions } from '../Suite';
import Test, { isTestOptions, TestOptions } from '../Test';
import { deepMixin } from 'dojo-core/lang';
import { Handle } from 'dojo-interfaces/core';
import Task from 'dojo-core/async/Task';
import Formatter from '../common/Formatter';
import { getLoaderScript, parseValue, pullFromArray } from '../common/util';
import Reporter, { ReporterOptions } from '../reporters/Reporter';
import getObjectInterface, { ObjectInterface } from '../interfaces/object';
import getTddInterface, { TddInterface } from '../interfaces/tdd';
import getBddInterface, { BddInterface } from '../interfaces/bdd';
import Promise from 'dojo-shim/Promise';
import * as chai from 'chai';
import global from 'dojo-core/global';
import Deferred from '../Deferred';

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

	protected _internPath: string;

	protected _loader: Loader;

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

		this._availableReporters = {};
		this._listeners = {};
		this._reporters = [];
		this._interfaces = {};
		this._internPath = '';

		if (config) {
			this.configure(config);
		}

		this._rootSuite = new Suite({
			executor: this,
			name: this.config.name
		});
	}

	abstract get environmentType(): string;

	get config() {
		return this._config;
	}

	get formatter() {
		if (!this._formatter) {
			this._formatter = new Formatter(this.config);
		}
		return this._formatter;
	}

	get internPath() {
		return this._internPath;
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
	 * Create a Deferred object that can be used in enviroments without native Promises
	 */
	createDeferred<T>() {
		return new Deferred<T>();
	}

	/**
	 * Emit an event to all registered listeners.
	 *
	 * Event listeners may execute async code, and a failing handler (one that rejects or throws an error) will cause the
	 * emit to fail.
	 */
	emit(eventName: 'afterRun'): Task<any>;
	emit(eventName: 'beforeRun'): Task<any>;
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

			return resolvedTask;
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
			return this.emit('log', message);
		}
		else {
			return resolvedTask;
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
	 * Register a loader script that will be loaded at the beginning of the testing process. Intern assumes this script
	 * will handle the loading of test suites.
	 */
	registerLoader(loader: Loader) {
		this._loader = loader;
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
				this._runTask = this._preloadScripts()
					.then(() => this._resolveConfig())
					.then(() => this.emit('beforeRun'))
					.then(() => this._beforeRun())
					.then(() => this._loadSuites())
					.then(() => {
						return this.emit('runStart')
							.then(() => this._runTests())
							.finally(() => this.emit('runEnd'));
					})
					.finally(() => this._afterRun())
					.finally(() => this.emit('afterRun'))
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
		return resolvedTask;
	}

	/**
	 * Code to execute before the main test run has started to set up the test system. This is where Executors can do
	 * any last-minute configuration before the testing process begins.
	 */
	protected _beforeRun(): Task<any> {
		this.config.reporters.forEach(reporter => {
			if (typeof reporter === 'string') {
				const ReporterClass = this._getReporter(reporter);
				this._reporters.push(new ReporterClass(this));
			}
			else {
				const ReporterClass = this._getReporter(reporter.reporter);
				this._reporters.push(new ReporterClass(this, reporter.options));
			}
		});

		return resolvedTask;
	}

	protected _emitCoverage() {
		const coverage = global[this.config.instrumenterOptions.coverageVariable];
		if (coverage) {
			return this.emit('coverage', { coverage, sessionId: this.config.sessionId });
		}
	}

	/**
	 * Return a reporter constructor corresponding to the given name
	 */
	protected _getReporter(name: string): typeof Reporter {
		if (!this._availableReporters[name]) {
			throw new Error(`A reporter named "${name}" has not been registered`);
		}
		return this._availableReporters[name];
	}

	/**
	 * Load suites
	 */
	protected _loadSuites(config?: Config) {
		config = config || this.config;
		return this.loadScript(config.loader.script).then(() => {
			if (!this._loader) {
				throw new Error(`Loader script ${config.loader.script} did not register a loader callback`);
			}
			return Task.resolve(this._loader(config || this.config));
		});
	}

	protected _preloadScripts() {
		if (this.config.preload) {
			return this.loadScript(this.config.preload);
		}
		return resolvedTask;
	}

	/**
	 * Process an arbitrary config value. Subclasses can override this method to pre-process arguments or handle them
	 * instead of allowing Executor to.
	 */
	protected _processOption(name: keyof Config, value: any) {
		switch (name) {
			case 'loader':
				if (typeof value === 'string') {
					try {
						value = parseValue(name, value, 'object');
					}
					catch (error) {
						value = { script: value };
					}
				}

				if (!value.script) {
					throw new Error(`Invalid value "${value}" for ${name}`);
				}

				if (!(/\.js$/i).test(value.script)) {
					value.script = getLoaderScript(value.script);
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

			case 'benchmarkSuites':
			case 'preload':
			case 'suites':
				this.config[name] = parseValue(name, value, 'string[]');
				break;

			default:
				this.config[name] = value;
		}
	}

	/**
	 * Resolve the config object
	 */
	protected _resolveConfig() {
		const config = this.config;

		if (config.grep == null) {
			config.grep = new RegExp('');
		}

		if (config.suites == null) {
			config.suites = [];
		}

		if (config.benchmarkSuites == null) {
			config.benchmarkSuites = [];
		}

		if (config.reporters == null) {
			config.reporters = [];
		}

		if (config.loader == null) {
			config.loader = { script: getLoaderScript('default') };
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

		if (!config.reporters) {
			config.reporters = [];
		}

		return resolvedTask;
	}

	/**
	 * Runs each of the root suites, limited to a certain number of suites at the same time by `maxConcurrency`.
	 */
	protected _runTests() {
		return this._rootSuite.run().finally(() => this._emitCoverage());
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

/**
 * This is the default executor class.
 */
export abstract class Executor extends GenericExecutor<Events, Config> { }
export default Executor;

export interface ExecutorConstructor<E extends Events, C extends Config, T extends GenericExecutor<E, C>> {
	new (config: C): T;
}

export { Handle };

export interface Config {
	/** If true, Intern will exit as soon as any test fails. */
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

	/**
	 * A loader to run before testing.
	 * The `loader` property can be a string with a loader name or the path to a loader script. It may also be an object
	 * with `script` and `config` properties. Intern provides built-in loader scripts for Dojo and Dojo2, which can be
	 * specified with the IDs 'dojo' and 'dojo2'.
	 *
	 * ```ts
	 * loader: 'dojo2'
	 * loader: 'tests/loader.js'
	 * loader: { script: 'dojo', config: { packages: [ { name: 'app', location: './js' } ] } }
	 * ```
	 */
	loader?: { script: string, config?: { [key: string]: any } };

	/** A top-level name for this configuration. */
	name?: string;

	/**
	 * A list of scripts to load before suites are loaded. These must be simple scripts, not modules, as a module loader
	 * may not be available when these are loaded. Also, these scripts should be synchronous. If they need to run async
	 * actions, they can register listeners for the 'runBefore' or 'runAfter' executor events.
	 */
	preload?: string[];

	/**
	 * A list of reporter names or descriptors. These reporters will be loaded and instantiated before testing begins.
	 */
	reporters?: (string | { reporter: string, options?: ReporterOptions })[];

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

	/** Emitted after the local executor has finished running suites */
	afterRun: never;

	/** Emitted before the local executor loads suites */
	beforeRun: never;

	/** Coverage info has been gathered */
	coverage: CoverageMessage;

	/** A deprecated method was called */
	deprecated: DeprecationMessage;

	/** An unhandled error occurs */
	error: Error;

	/** A debug log event */
	log: string;

	/** All tests have finished running */
	runEnd: never;

	/** Emitted just before tests start running  */
	runStart: never;

	/** A suite has fininshed running */
	suiteEnd: Suite;

	/** A suite has started running */
	suiteStart: Suite;

	/** A test has finished */
	testEnd: Test;

	/** A test has started */
	testStart: Test;
};

/**
 * An async loader callback. Intern will wait for the done callback to be called before proceeding.
 */
export interface Loader {
	(config: { [key: string]: any }): Task<void> | void;
}

const resolvedTask = Task.resolve();
