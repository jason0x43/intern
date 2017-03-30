import Suite, { SuiteOptions } from './Suite';
import UrlSearchParams from 'dojo-core/UrlSearchParams';
import { Hash } from 'dojo-interfaces/core';
import { parse } from 'url';
import Task from 'dojo-core/async/Task';
import { InternError } from './types';
import WebDriver, { Events } from './executors/WebDriver';
import { Config } from './executors/Remote';
import { Handle } from 'dojo-interfaces/core';

/**
 * RemoteSuite is a class that acts as a local server for one or more unit test suites being run in a remote browser.
 */
export default class RemoteSuite extends Suite {
	executor: WebDriver;

	/** The HTML page that will be used to host the tests */
	harness: string;

	/** If true, the remote suite will wait for ackowledgements from the host for runtime events. */
	runInSync: boolean;

	constructor(config: SuiteOptions) {
		super(config);

		if (this.timeout == null) {
			this.timeout = Infinity;
		}

		this.tests = [];
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
		const server = this.executor.server;
		let listenerHandle: Handle;
		let contactTimer: NodeJS.Timer | false;

		const task = new Task(
			(resolve, reject) => {
				const handleError = (error: InternError) => {
					this.error = error;
					reject(error);
				};

				// Subscribe to messages received by the server for a particular remote session ID.
				listenerHandle = server.subscribe(sessionId, (name: keyof Events, data: any) => {
					let suite: Suite;

					if (contactTimer) {
						clearTimeout(contactTimer);
					}
					contactTimer = false;

					switch (name) {
						case 'suiteStart':
							suite = data;
							if (!suite.hasParent) {
								// This suite from the browser is a root suite; add its tests to the local suite
								this.tests.push(...suite.tests);

								// Tell the executor that the local suite has started
								return this.executor.emit('suiteStart', this);
							}
							else {
								// If suite from the browser isn't a root (i.e., it's a nested suite), just forward the
								// start event
								return this.executor.emit(name, data);
							}

						case 'suiteEnd':
							suite = data;
							this.skipped = suite.skipped;

							if (!suite.hasParent) {
								// When the remote root suite has finished, replace the local test objects with the
								// incoming test data since it will include final results.
								suite.tests.forEach((test, index) => {
									this.tests[index] = test;
								});

								if (suite.error) {
									handleError(suite.error);
								}
							}
							else {
								// If suite from the browser isn't a root, just forward the end event
								return this.executor.emit(name, data);
							}
							break;

						case 'beforeRun':
						case 'afterRun':
						case 'runStart':
							// Consume these events -- they shouldn't be forwarded to any local listeners
							break;

						case 'runEnd':
							// Consume this event, and do some post-processing
							let promise = remote.setHeartbeatInterval(0);
							if (config.excludeInstrumentation !== true) {
								// get about:blank to always collect code coverage data from the page in case it is
								// navigated away later by some other process; this happens during self-testing when the
								// Leadfoot library takes over
								promise = promise.get('about:blank');
							}
							return promise.then(resolve, reject);

						case 'error':
							handleError(data);
							break;

						default:
							return this.executor.emit(name, data);
					}
				});

				const config = this.executor.config;
				const serverUrlPath = parse(config.serverUrl).pathname;

				// Intern runs unit tests on the remote Selenium server by navigating to the client runner HTML page. No
				// real commands are issued after the call to remote.get() below until all unit tests are complete, so
				// we need to make sure that we periodically send no-ops through the channel to ensure the remote server
				// does not treat the session as having timed out
				const timeout = config.capabilities['idle-timeout'];
				if (timeout >= 1 && timeout < Infinity) {
					remote.setHeartbeatInterval((timeout - 1) * 1000);
				}

				// These are options that will be passed as query params to the test harness page
				const queryOptions: Config = {
					basePath: serverUrlPath,
					debug: config.debug,
					sessionId: sessionId,
					socketPort: server.socketPort
				};

				// Do some pre-serialization of the options
				const queryParams: Hash<any> = {};
				Object.keys(queryOptions).filter(key => {
					return queryOptions[key] != null;
				}).forEach(key => {
					let value = queryOptions[key];
					if (typeof value === 'object') {
						value = JSON.stringify(value);
					}
					queryParams[key] = value;
				});

				const query = new UrlSearchParams(queryParams);
				const harness = `${config.serverUrl}__intern/browser/remote.html`;

				// These are options that will be POSTed to the remote page and used to configure intern
				const remoteConfig: Config = {
					basePath: serverUrlPath,
					name: this.id,
					sessionId: sessionId
				};

				[ 'suites', 'debug', 'runInSync', 'preload', 'loader' ].forEach(key => {
					remoteConfig[key] = config[key];
				});

				remote
					.get(`${harness}?${query}`)
					// Send the config data in an execute block to avoid sending very large query strings
					.execute(function (options: any) {
						intern.configure(options);
						intern.run().catch(_error => {});
					}, [remoteConfig])
					.then(() => {
						// If the task hasn't been resolved yet, start a timer that will cancel this suite if no contact
						// is received from the remote in a given time. The task could be resolved if, for example, the
						// static configuration code run in client.html sends an error message back through the server
						// before execution gets here.
						if (contactTimer !== false) {
							contactTimer = setTimeout(() => {
								handleError(new Error('No contact from remote browser'));
							}, this.executor.config.contactTimeout);
						}
					})
					// If there's an error loading the page, kill the heartbeat and fail
					.catch(error => remote.setHeartbeatInterval(0).finally(() => handleError(error)));
			},
			// Canceller
			() => remote.setHeartbeatInterval(0)
		).finally(() => {
			listenerHandle.destroy();
			return this.executor.emit('suiteEnd', this);
		});

		return task;
	}
}
