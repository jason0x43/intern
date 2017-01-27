import Suite, { SuiteProperties } from './Suite';
import UrlSearchParams from 'dojo-core/UrlSearchParams';
import { Hash } from 'dojo-interfaces/core';
import { parse } from 'url';
import { relative } from 'path';
import Task from 'dojo-core/async/Task';
import { InternError } from '../common';
import WebDriver, { Events } from './executors/WebDriver';
import Proxy from './Proxy';
import { Handle } from 'dojo-interfaces/core';

/**
 * RemoteSuite is a class that acts as a local proxy for one or more unit test suites being run in a remote browser.
 */
export default class RemoteSuite extends Suite implements RemoteSuiteProperties {
	executor: WebDriver;

	proxy: Proxy;

	suites: string[];

	constructor(config: RemoteSuiteOptions) {
		super(config);

		if (this.timeout == null) {
			this.timeout = Infinity;
		}
	}

	/**
	 * Run a suite in a remote browser.
	 *
	 * TODO: Change this from using Selenium-provided sessionId to self-generated constant identifier so that sessions
	 * can be safely reset in the middle of a test run
	 */
	run(): Task<any> {
		const remote = this.remote;
		const sessionId = remote.session.sessionId;
		const proxy = this.executor.proxy;
		let listenerHandle: Handle;

		return new Task(
			(resolve, reject) => {
				const handleError = (error: InternError) => {
					this.error = error;
					reject(error);
				};

				// Subscribe to events on the proxy so we'll know the status of the remote suite.
				listenerHandle = proxy.subscribe(sessionId, (name: keyof Events, data: any) => {
					const forward = () => this.executor.emit(name, data);
					let suite: Suite;

					switch (name) {
						case 'suiteStart':
							suite = data;
							if (!suite.hasParent) {
								// This suite from the browser is a root suite; add its tests to the local suite
								suite.tests.forEach(test => {
									this.tests.push(test);
								});
								// Tell the executor that the local suite has started
								this.executor.emit('suiteStart', this);
							}
							else {
								forward();
							}
							break;

						case 'suiteEnd':
							suite = data;
							this.skipped = suite.skipped;

							if (!suite.hasParent) {
								suite.tests.forEach((test, index) => {
									this.tests[index] = test;
								});

								// This suite from the browser is a root suite; update the existing test objects with
								// the new ones from the server that reflect the test results
								if (suite.error) {
									handleError(suite.error);
								}
							}
							else {
								forward();
							}
							break;

						case 'runStart':
							// Consume this event
							break;

						case 'runEnd':
							let promise = remote.setHeartbeatInterval(0);
							if (config.excludeInstrumentation !== true) {
								// get about:blank to always collect code coverage data from the page in case it is
								// navigated away later by some other process; this happens during self-testing when the
								// Leadfoot library takes over
								promise = promise.get('about:blank');
							}

							promise.then(resolve, reject);
							break;

						case 'error':
							handleError(data);
							break;

						default:
							forward();
							break;
					}
				});

				const config = this.executor.config;
				const proxyBasePath = parse(config.proxyUrl).pathname;

				// Intern runs unit tests on the remote Selenium server by navigating to the client runner HTML page. No
				// real commands are issued after the call to remote.get() below until all unit tests are complete, so
				// we need to make sure that we periodically send no-ops through the channel to ensure the remote server
				// does not treat the session as having timed out
				const timeout = config.capabilities['idle-timeout'];
				if (timeout >= 1 && timeout < Infinity) {
					remote.setHeartbeatInterval((timeout - 1) * 1000);
				}

				let clientReporter = config.runnerClientReporter;
				if (typeof clientReporter !== 'object') {
					clientReporter = { reporter: 'webdriver' };
				}

				const options = new UrlSearchParams(<Hash<any>>{
					// The proxy always serves the baseUrl from the loader configuration as the root of the proxy, so
					// ensure that baseUrl is always set to that root on the client
					basePath: proxyBasePath,
					initialBaseUrl: proxyBasePath + relative(config.basePath, process.cwd()),
					reporter: clientReporter,
					rootSuiteName: this.id,
					sessionId: sessionId
				});

				remote
					.get(config.proxyUrl + '__intern/client.html?' + options)
					// If there's an error loading the page, kill the heartbeat and fail
					.catch(error => remote.setHeartbeatInterval(0).finally(() => handleError(error)));
			},
			// Canceller
			() => remote.setHeartbeatInterval(0)
		).then(
			() => this.executor.emit('suiteEnd', this),
			error => this.executor.emit('suiteEnd', this).then(() => {
				throw error;
			})
			).finally(() => {
				listenerHandle.destroy();
			});
	}
}

export interface RemoteSuiteProperties extends SuiteProperties {
	proxy: Proxy;

	/** The pathnames of suite modules that will be managed by this remote suite. */
	suites: string[];
}

export type RemoteSuiteOptions = Partial<RemoteSuiteProperties> & { name: string };
