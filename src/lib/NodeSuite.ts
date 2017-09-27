import { spawn } from 'child_process';
import { join } from 'path';
import { Handle, Hash } from '@dojo/interfaces/core';
import Task from '@dojo/core/async/Task';

import Suite, { SuiteOptions } from './Suite';
import { InternError } from './types';
import Node, { Events, Config as NodeConfig } from './executors/Node';
import { stringify } from './common/util';
import Deferred from './Deferred';

// This is used for the `execute` config block
declare const intern: Node;

/**
 * NodeSuite is a class that manages unit test suites being run in a separate
 * process.
 */
export default class NodeSuite extends Suite {
	executor: Node;

	constructor(options?: Partial<SuiteOptions>) {
		options = options || {};
		if (options.name == null) {
			options.name = 'remote unit tests';
		}

		super(<SuiteOptions>options);

		if (this.timeout == null) {
			this.timeout = Infinity;
		}
	}

	/**
	 * Override Suite#id to exclude the RemoteSuite's name from the generated ID
	 * since the RemoteSuite is just a proxy for a remote suite.
	 */
	get id() {
		let name: string[] = [];
		let suite: Suite = this.parent;

		do {
			suite.name != null && name.unshift(suite.name);
		} while ((suite = suite.parent));

		return name.join(' - ');
	}

	/**
	 * Run a suite in a remote browser.
	 */
	run(): Task<any> {
		const sessionId = this.sessionId;

		const scriptPath = join(this.executor.internPath, 'bin', 'remote.js');
		const process = spawn('node', [scriptPath], {
			stdio: ['inherit', 'inherit', 'inherit', 'ipc']
		});

		return new Task((resolve, reject) => {
			const handleError = (error: InternError) => {
				this.error = error;
				reject(error);
			};

			// This is a deferred that will resolve when the remote sends
			// back a 'remoteConfigured' message
			const pendingConnection = new Deferred<void>();

			// Subscribe to messages received by the server for a particular
			// remote session ID.
			process.on('message', (name: keyof RemoteEvents, data: any) => {
				let suite: Suite;

				switch (name) {
					case 'remoteStatus':
						if (data === 'initialized') {
							pendingConnection.resolve();
						}
						break;

					case 'suiteStart':
						suite = data;
						if (!suite.hasParent) {
							// This suite from the browser is a root
							// suite; add its tests to the local suite
							this.tests.push(...suite.tests);

							// Tell the executor that the local suite
							// has started
							return this.executor.emit('suiteStart', this);
						} else {
							// If suite from the browser isn't a root
							// (i.e., it's a nested suite), just forward
							// the start event
							return this.executor.emit(name, data);
						}

					case 'suiteEnd':
						suite = data;
						this.skipped = suite.skipped;

						if (!suite.hasParent) {
							// When the remote root suite has finished,
							// replace the local test objects with the
							// incoming test data since it will include
							// final results.
							suite.tests.forEach((test, index) => {
								this.tests[index] = test;
							});

							if (suite.error) {
								handleError(suite.error);
							}
						} else {
							// If suite from the browser isn't a root,
							// just forward the end event
							return this.executor.emit(name, data);
						}
						break;

					case 'beforeRun':
					case 'afterRun':
					case 'runStart':
						// Consume these events -- they shouldn't be
						// forwarded to any local listeners
						break;

					case 'runEnd':
						// Consume this event, and do some
						// post-processing
						let promise = remote.setHeartbeatInterval(0);
						if (this.executor.hasCoveredFiles) {
							// get about:blank to always collect code
							// coverage data from the page in case it is
							// navigated away later by some other
							// process; this happens during self-testing
							// when the Leadfoot library takes over
							promise = promise.get('about:blank');
						}
						return promise.then(resolve, reject);

					case 'error':
						// Ignore summary suite error messages
						if (!/One or more suite errors/.test(data.message)) {
							handleError(data);
						}
						break;

					default:
						return this.executor.emit(name, data);
				}
			});

			const config = this.executor.config;

			// These are options that will be passed as query params to the
			// test harness page
			const queryOptions: Partial<RemoteConfig> = {
				basePath: serverUrl.pathname,
				serverUrl: serverUrl.href,
				sessionId: sessionId,
				socketPort: server.socketPort
			};

			// Do some pre-serialization of the options
			const queryParams: Hash<any> = {};
			Object.keys(queryOptions)
				.filter((key: keyof RemoteConfig) => {
					return queryOptions[key] != null;
				})
				.forEach((key: keyof RemoteConfig) => {
					let value = queryOptions[key];
					if (typeof value === 'object') {
						value = JSON.stringify(value);
					}
					queryParams[key] = value;
				});

			const query = new UrlSearchParams(queryParams);
			const harness = `${config.serverUrl}__intern/browser/remote.html`;

			// These are options that will be POSTed to the remote page and
			// used to configure intern. Stringify and parse them to ensure
			// that the config can be properly transmitted.
			const remoteConfig: Partial<RemoteConfig> = {
				debug: config.debug,
				internPath: `${serverUrl.pathname}${config.internPath}`,
				name: this.id,
				reporters: [{ name: 'dom' }]
			};

			// Don't overwrite any config data we've already set
			const excludeKeys: { [key: string]: boolean } = {
				basePath: true,
				internPath: true,
				name: true,
				reporters: true,
				serverUrl: true,
				sessionId: true,
				socketPort: true
			};

			// Pass all non-excluded keys to the remote config
			Object.keys(config)
				.filter(key => !excludeKeys[key])
				.forEach((key: keyof RemoteConfig) => {
					remoteConfig[key] = config[key];
				});

			this.executor.log(
				'Configuring remote "',
				this.name,
				'" with',
				remoteConfig
			);

			pendingConnection.promise
				.then(() => {
					// Send the config data in an execute block to avoid sending
					// very large query strings
					return send({ name: 'configure', data: remoteConfig });
				})
				.then(() => {
					return send({ name: 'run' });
				})
				// If there's an error loading the page, kill the heartbeat
				// and fail
				.catch(handleError);
		})
			.catch(error => {
				if (!this.error) {
					this.error = error;
				}
				throw error;
			})
			.finally(() => {
				process.disconnect();
			})
			.finally(() => this.executor.emit('suiteEnd', this));
	}
}

export interface RemoteEvents extends Events {
	remoteStatus: string;
}

export interface RemoteConfig extends NodeConfig {
	sessionId: string;
	runInSync?: boolean;
}

function send(data: any) {
	return new Promise<void>((resolve, reject) => {
		process.send!(data, (error: Error) => {
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		});
	});
}
