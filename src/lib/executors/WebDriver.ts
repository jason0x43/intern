import Executor, { Config as BaseConfig, Events as BaseEvents } from './Executor';
import Tunnel, { TunnelOptions } from 'digdug/Tunnel';
import NullTunnel from 'digdug/NullTunnel';
import Proxy from '../Proxy';
import { deepMixin } from 'dojo-core/lang';
import Reporter from '../reporters/Reporter';
import Runner from '../reporters/Runner';
import Pretty from '../reporters/Pretty';
import Task from 'dojo-core/async/Task';
import Server = require('leadfoot/Server');
import ProxiedSession from '../ProxiedSession';
import resolveEnvironments from '../resolveEnvironments';
import Suite from '../Suite';
import RemoteSuite from '../RemoteSuite';
import { retry } from '../util';
import EnvironmentType from '../EnvironmentType';
import Command = require('leadfoot/Command');

/**
 * The WebDriver executor is used to run unit tests in a remote browser, and to run functional tests against a remote
 * browser, using the WebDriver protocol.
 *
 * Unit and functional tests are handled fundamentally differently. Unit tests are only handled as module names here;
 * they will be loaded in a remote browser session, not in this executor. Functional tests, on the other hand, are loaded
 * and executed directly in this executor.
 */
export default class WebDriver extends Executor<Events> {
	config: Config;

	proxy: Proxy;

	tunnel: Tunnel;

	constructor(config: Partial<Config> = {}) {
		const defaults: Partial<Config> = {
			capabilities: { 'idle-timeout': 60 },
			environmentRetries: 3,
			environments: [],
			maxConcurrency: Infinity,
			reporters: ['runner'],
			runnerClientReporter: { reporter: 'webdriver' },
			tunnel: NullTunnel,
			tunnelOptions: { tunnelId: String(Date.now()) }
		};

		super(deepMixin(defaults, config));
	}

	protected _afterRun() {
		return super._afterRun()
			.finally(() => {
				return Task.all([
					this.proxy.stop().then(() => this.emit('proxyEnd', this.proxy)),
					this.tunnel.stop().then(() => this.emit('tunnelStop', { tunnel: this.tunnel }))
				])
					// We do not want to actually return an array of values, so chain a callback that resolves to
					// undefined
					.then(() => { });
			});
	}

	protected _beforeRun() {
		const config = this.config;

		if (!config.capabilities.name) {
			config.capabilities.name = 'intern';
		}

		const buildId = process.env.TRAVIS_COMMIT || process.env.BUILD_TAG;
		if (buildId) {
			config.capabilities.build = buildId;
		}

		config.proxyUrl = config.proxyUrl.replace(/\/*$/, '/');
		config.tunnelOptions.servers = (config.tunnelOptions.servers || []).concat(config.proxyUrl);

		if (this._reporters.length === 0) {
			this._reporters.push(new Runner(this));
		}

		const promise = super._beforeRun().then(() => {
			const proxy = this._createProxy();
			return proxy.start().then(() => {
				this.proxy = proxy;
				return this.emit('proxyStart', proxy);
			});
		});

		// If we're in proxyOnly mode, just start the proxy server. Don't create session suites or start a tunnel.
		if (config.proxyOnly) {
			return promise.then(() => {
				// This is normally handled in Executor#run, but in proxyOnly mode we short circuit the normal sequence
				return Task.resolve(config.setup && config.setup.call(config, this))
					.then(function () {
						// Pause indefinitely until canceled
						return new Promise(function () { });
					})
					.finally(() => {
						return Task.resolve(config.teardown && config.teardown.call(config, this));
					})
					.finally(() => {
						return this.proxy && this.proxy.stop();
					});
			});
		}

		if (!config.suites) {
			config.suites = [];
		}

		return promise
			.then(() => this._createSessionSuites())
			.then(suites => {
				// The session suites are the new root suites, and the original root suites will be sub-suites of the
				// session suites.
				this._rootSuites = suites;

				const tunnel = this.tunnel;

				tunnel.on('downloadprogress', progress => {
					this.emit('tunnelDownloadProgress', { tunnel, progress });
				});

				tunnel.on('status', status => {
					this.emit('tunnelStatus', { tunnel, status: status.status });
				});

				config.capabilities = deepMixin(tunnel.extraCapabilities, config.capabilities);

				return tunnel.start().then(() => {
					return this.emit('tunnelStart', { tunnel });
				});
			});
	}

	/**
	 * Creates an instrumenting proxy for sending instrumented code to the remote environment and receiving
	 * data back from the remote environment.
	 */
	protected _createProxy() {
		return new Proxy({
			basePath: this.config.basePath,
			instrumenterOptions: this.config.instrumenterOptions,
			excludeInstrumentation: this.config.excludeInstrumentation,
			instrument: true,
			waitForRunner: this.config.runnerClientReporter.waitForRunner,
			port: this.config.proxyPort
		});
	}

	/**
	 * Creates suites for each environment in which tests will be executed.
	 */
	protected _createSessionSuites() {
		const config = this.config;
		const proxy = this.proxy;
		const tunnel = this.tunnel;
		const server = new Server<ProxiedSession>(tunnel.clientUrl, {
			proxy: tunnel.proxy
		});
		const functionalSuites = this._rootSuites;

		server.sessionConstructor = ProxiedSession;

		// TODO: The Promise.resolve check is just to get around some Task-related typing issues with
		// Tunnel#getEnvironments.
		return Promise.resolve(tunnel.getEnvironments()).then(tunnelEnvironments => {
			return resolveEnvironments(
				config.capabilities,
				config.environments,
				tunnelEnvironments
			).map(environmentType => {
				// Create a new root suite for each environment

				const executor = this;

				const suite = new Suite({
					name: String(environmentType),
					publishAfterSetup: true,
					grep: config.grep,
					bail: config.bail,
					tests: [],
					timeout: config.defaultTimeout,

					before() {
						return retry(
							() => server.createSession(environmentType),
							config.environmentRetries
						).then(session => {
							session.coverageEnabled = config.excludeInstrumentation !== true;
							session.coverageVariable = config.instrumenterOptions.coverageVariable;
							session.proxyUrl = config.proxyUrl;
							session.proxyBasePathLength = config.basePath.length;

							let command: Remote = <Remote>new Command(session);
							command.environmentType = new EnvironmentType(session.capabilities);

							suite.remote = command;
							// TODO: Document or remove sessionStart/sessionEnd.
							return executor.emit('sessionStart', command);
						});
					},

					after() {
						const remote = this.remote;

						const endSession = () => {
							return executor.emit('sessionEnd', remote).then(() => {
								return tunnel.sendJobState(remote.session.sessionId, {
									success: this.numFailedTests === 0 && !this.error
								});
							});
						};

						if (remote) {
							if (
								config.leaveRemoteOpen === true ||
								(config.leaveRemoteOpen === 'fail' && this.numFailedTests > 0)
							) {
								return endSession();
							}

							// A Command behaves like a Promise for our needs
							return remote.quit().finally(endSession);
						}
					}
				});

				// If functional tests were added to this executor, add them to the session suite.
				functionalSuites.forEach(functionalSuite => {
					suite.add(functionalSuite);
				});

				// If unit tests were added to this executor, wrap them in a RemoteSuite and add that to the session
				// suite.
				if (config.suites.length > 0) {
					suite.add(new RemoteSuite({
						name: 'unit tests',
						suites: config.suites,
						proxy: proxy
					}));
				}

				return suite;
			});
		});
	}

	protected _getReporter(name: string): typeof Reporter {
		switch (name) {
			case 'runner':
				return Runner;
			case 'pretty':
				return Pretty;
		}
	}
}

export interface Config extends BaseConfig {
	basePath: string;
	capabilities: {
		name?: string;
		build?: string;
		[key: string]: any;
	};
	environments: any[];
	environmentRetries: number;
	leaveRemoteOpen: boolean | 'fail';
	proxy: Proxy;
	proxyOnly: boolean;
	proxyPort: number;
	proxyUrl: string;
	runnerClientReporter: {
		reporter: string;
		waitForRunner?: boolean;
	};
	tunnel: typeof Tunnel;
	tunnelOptions: TunnelOptions & { servers?: string[] };

	/** A list of unit test suites that will be run in remote browsers */
	suites: string[];
}

export interface Remote extends Command<any> {
	environmentType?: EnvironmentType;
	setHeartbeatInterval(delay: number): Command<any>;
}

export interface TunnelMessage {
	tunnel: Tunnel;
	progress?: any;
	status?: string;
}

export interface Events extends BaseEvents {
	proxyEnd: Proxy;
	proxyStart: Proxy;
	sessionStart: Remote;
	sessionEnd: Remote;
	tunnelDownloadProgress: TunnelMessage;
	tunnelStart: TunnelMessage;
	tunnelStatus: TunnelMessage;
	tunnelStop: TunnelMessage;
};
