import Executor from './executors/Executor';
import Deferred from './Deferred';
import Task, { isTask } from 'dojo-core/async/Task';
import { InternError } from './common';
import { Remote } from './executors/WebDriver';
import Suite from './Suite';
import { mixin } from 'dojo-core/lang';

export default class Test implements TestProperties {
	hasPassed = false;

	name: string;

	parent: Suite;

	skipped: string;

	test: TestFunction;

	isAsync = false;

	timeElapsed = 0;

	error: InternError;

	protected _timeout: number;

	protected _runTask: Task<any>;

	protected _timer: number;

	protected _usesRemote = false;

	constructor(options: TestOptions) {
		if (!options.name && !options.test) {
			throw new Error('A Test requires a name and a test function');
		}

		mixin(this, options);
	}

	get executor(): Executor {
		return this.parent && this.parent.executor;
	}

	/**
	 * The unique identifier of the test, assuming all combinations of suite + test are unique.
	 */
	get id() {
		let name: string[] = [];
		let object: (Suite | Test) = this;

		do {
			object.name != null && name.unshift(object.name);
		} while ((object = object.parent));

		return name.join(' - ');
	}

	/**
	 * The unique identifier of the test's parent.
	 */
	get parentId() {
		return this.parent.id;
	}

	/**
	 * The WebDriver interface for driving a remote environment.
	 * @see Suite#remote
	 */
	get remote(): Remote {
		this._usesRemote = true;
		return this.parent.remote;
	}

	get sessionId() {
		return this.parent.sessionId;
	}

	get timeout() {
		if (this._timeout != null) {
			return this._timeout;
		}
		else if (this.parent) {
			return this.parent.timeout;
		}
		else {
			return 30000;
		}
	}

	set timeout(value) {
		this._timeout = value;
	}

	/**
	 * A convenience function that generates and returns a special Deferred that can be used for asynchronous
	 * testing.
	 * Once called, a test is assumed to be asynchronous no matter its return value (the generated Deferred's
	 * promise will always be used as the implied return value if a promise is not returned by the test function).
	 *
	 * @param timeout If provided, the amount of time to wait before rejecting the test with a timeout error, in milliseconds.
	 * @param numCallsUntilResolution The number of times that resolve needs to be called before the Deferred is actually resolved.
	 */
	async(timeout?: number, numCallsUntilResolution?: number): Deferred<any> {
		this.isAsync = true;

		if (timeout != null) {
			this.timeout = timeout;
		}

		if (!numCallsUntilResolution) {
			numCallsUntilResolution = 1;
		}

		const dfd = new Deferred();
		const oldResolve = dfd.resolve;

		/**
		 * Eventually resolves the deferred, once `resolve` has been called as many times as specified by the
		 * `numCallsUntilResolution` parameter of the original `async` call.
		 */
		dfd.resolve = function (this: any) {
			--numCallsUntilResolution;
			if (numCallsUntilResolution === 0) {
				oldResolve.apply(this, arguments);
			}
			else if (numCallsUntilResolution < 0) {
				throw new Error('resolve called too many times');
			}
		};

		// A test may call this function multiple times and should always get the same Deferred
		this.async = function () {
			return dfd;
		};

		return dfd;
	}

	/**
	 * During an asynchronous test run, restarts the timeout timer.
	 */
	restartTimeout(timeout?: number) {
		timeout = timeout == null ? this.timeout : timeout;

		if (this._runTask) {
			clearTimeout(this._timer);
			const timer = setTimeout(() => {
				if (this._runTask) {
					this._runTask.cancel();
				}
			}, timeout);
			this._timer = <number>(<any>timer);
		}
		else {
			this.timeout = timeout;
		}
	}

	/**
	 * Runs the test.
	 */
	run() {
		let startTime: number;

		// Reset some state in case someone tries to re-run the same test
		// TODO: Cancel any previous outstanding test run
		// TODO: Test
		this.async = Object.getPrototypeOf(this).async;
		this._usesRemote = false;
		this.hasPassed = false;
		this.isAsync = false;
		this.error = null;
		this.skipped = null;
		this.timeElapsed = null;

		return this.executor.emit('testStart', this)
			.then(() => {
				startTime = Date.now();
			})
			.then(() => {
				let result = this.test();

				// Someone called `this.async`, so this test is async; we have to prefer one or the other, so
				// prefer the promise returned from the test function if it exists, otherwise get the one that was
				// generated by `Test#async`
				if (this.isAsync && (!result || !result.then)) {
					result = this.async().promise;
				}

				if (result && result.then) {
					// If a user did not call `this.async` but returned a promise we still want to mark this
					// test as asynchronous for informational purposes
					this.isAsync = true;

					const resultPromise = <Promise<any>>result;

					// The `result` promise is wrapped in order to allow timeouts to work when a user returns a
					// Promise from somewhere else that does not support cancellation
					this._runTask = new Task(
						(resolve, reject) => {
							resultPromise.then(resolve, reject);

							if (isTask(resultPromise)) {
								resultPromise.finally(reject);
							}
						},
						() => {
							// Dojo 2 promises are designed to allow extra signalling if a task has to perform
							// cleanup when it is cancelled; some others, including Dojo 1 promises, do not. In
							// order to ensure that a timed out test is never accidentally resolved, always throw
							// or re-throw the cancel reason
							if (isTask(resultPromise)) {
								resultPromise.cancel();
							}
						}
					);

					this.restartTimeout();
					return this._runTask;
				}
			})
			.finally(() => {
				this.timeElapsed = Date.now() - startTime;
				clearTimeout(this._timer);
				this._timer = this._runTask = null;
			})
			.then(
				// Test completed successfully -- potentially passed
				() => {
					if (this._usesRemote && !this.isAsync) {
						throw new Error('Remote used in synchronous test! Tests using this.remote must ' +
							'return a promise or resolve a this.async deferred.');
					}
					this.hasPassed = true;
				},
				// There was an error running the test; could be a skip, could be an assertion failure
				error => {
					if (error === SKIP) {
						if (!this.skipped) {
							this.skipped = error.message;
						}
					}
					else {
						this.error = error;
					}
				}
			)
			.finally(() => this.executor.emit('testEnd', this));
	}

	/**
	 * Skips this test.
	 *
	 * @param message If provided, will be stored in this test's `skipped` property.
	 */
	skip(message: string = 'skipped') {
		this.skipped = message;
		throw SKIP;
	}

	toJSON() {
		let error: InternError = null;
		if (this.error) {
			error = {
				name: this.error.name,
				message: this.error.message,
				stack: this.error.stack,
				showDiff: Boolean(this.error.showDiff)
			};

			if (this.error.showDiff) {
				error.actual = this.error.actual;
				error.expected = this.error.expected;
			}
		}

		return {
			error: error,
			id: this.id,
			parentId: this.parentId,
			name: this.name,
			sessionId: this.sessionId,
			timeElapsed: this.timeElapsed,
			timeout: this.timeout,
			hasPassed: this.hasPassed,
			skipped: this.skipped
		};
	}
}

export function isTest(value: any): value is Test {
	return typeof value.hasPassed === 'boolean' && typeof value.timeElapsed === 'number';
}

export function isTestOptions(value: any): value is TestOptions {
	return !(value instanceof Test) && value.name != null && value.test != null;
}

export interface TestFunction {
	(this: Test): void | Promise<any>;
}

export interface TestProperties {
	hasPassed: boolean;
	name: string;
	parent: Suite;
	skipped: string;
	test: TestFunction;
}

export type TestOptions = Partial<TestProperties> & { name: string, test: TestFunction };

export const SKIP: any = {};
