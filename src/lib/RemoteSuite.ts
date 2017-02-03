import Suite, { SuiteProperties } from './Suite';
import UrlSearchParams from 'dojo-core/UrlSearchParams';
import { Hash } from 'dojo-interfaces/core';
import { parse } from 'url';
import Task from 'dojo-core/async/Task';
import { InternError } from '../intern';
import WebDriver, { Events } from './executors/WebDriver';
import Server from './Server';
import { Handle } from 'dojo-interfaces/core';
import { RemoteParams } from '../remote';

/**
 * RemoteSuite is a class that acts as a local server for one or more unit test suites being run in a remote browser.
 */
export default class RemoteSuite extends Suite implements RemoteSuiteProperties {
	contactTimeout: number;

	executor: WebDriver;

	loaderScript: string;

	server: Server;

	suites: string[];

	runInSync: boolean;

	constructor(config: RemoteSuiteOptions) {
		super(config);

		if (this.timeout == null) {
			this.timeout = Infinity;
		}

		if (this.contactTimeout == null) {
			this.contactTimeout = 5000;
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

				// Subscribe to events on the server so we'll know the status of the remote suite.
				listenerHandle = server.subscribe(sessionId, (name: keyof Events, data: any) => {
					let suite: Suite;
					const forward = () => this.executor.emit(name, data);

					if (contactTimer) {
						clearTimeout(contactTimer);
					}
					contactTimer = false;

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
				const serverUrlPath = parse(config.serverUrl).pathname;

				// Intern runs unit tests on the remote Selenium server by navigating to the client runner HTML page. No
				// real commands are issued after the call to remote.get() below until all unit tests are complete, so
				// we need to make sure that we periodically send no-ops through the channel to ensure the remote server
				// does not treat the session as having timed out
				const timeout = config.capabilities['idle-timeout'];
				if (timeout >= 1 && timeout < Infinity) {
					remote.setHeartbeatInterval((timeout - 1) * 1000);
				}

				const options: RemoteParams = {
					basePath: serverUrlPath,
					// initialBaseUrl: serverBasePath + relative(config.basePath, process.cwd()),
					name: this.id,
					sessionId: sessionId,
					suites: this.suites
				};

				if (this.loaderScript) {
					options.loaderScript = this.loaderScript;
				}

				if (this.executor.config.debug) {
					options.debug = true;
				}

				if (this.runInSync) {
					options.runInSync = true;
				}

				if (server.socketPort) {
					options.socketPort = server.socketPort;
				}

				const query = new UrlSearchParams(<Hash<any>>options);

				remote
					.get(config.serverUrl + '__intern/browser/remote.html?' + query)
					.then(() => {
						// If the task hasn't been resolved yet, start a timer that will cancel this suite if no contact
						// is received from the remote in a given time. The task could be resolved if, for example, the
						// static configuration code run in client.html sends an error message back through the server
						// before execution gets here.
						if (contactTimer !== false) {
							contactTimer = setTimeout(() => {
								handleError(new Error('No contact from remote browser'));
							}, this.contactTimeout);
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

export interface RemoteSuiteProperties extends SuiteProperties {
	/** Time to wait for contact from remote server */
	contactTimeout: number;

	loaderScript: string;
	server: Server;

	/** If true, the remote suite will wait for ackowledgements from the host for runtime events. */
	runInSync: boolean;

	/** The pathnames of suite modules that will be managed by this remote suite. */
	suites: string[];
}

export type RemoteSuiteOptions = Partial<RemoteSuiteProperties> & { name: string };
