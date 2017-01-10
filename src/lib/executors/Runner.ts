import RemoteSuite from '../RemoteSuite';
import { Config, Remote } from '../../common';
import EnvironmentType from '../EnvironmentType';
import Executor from './Executor';
import ProxiedSession from '../ProxiedSession';
import Proxy from '../Proxy';
import Suite from '../Suite';
import * as util from '../util';
import resolveEnvironments from '../resolveEnvironments';
import Tunnel from 'digdug/Tunnel';
import NullTunnel from 'digdug/NullTunnel';
import RunnerReporter from '../reporters/Runner';
import { deepMixin } from 'dojo/lang';
import DojoPromise = require('dojo/Promise');
import Server = require('leadfoot/Server');
import Command = require('leadfoot/Command');

/**
 * The Runner executor is used to run unit & functional tests in remote environments loaded through a WebDriver
 * conduit.
 */
export default class Runner extends Executor {
	mode: 'runner';

	proxy: Proxy;

	tunnel: Tunnel;

	constructor(config: Config) {
		config = deepMixin({
			capabilities: {
				'idle-timeout': 60
			},
			environmentRetries: 3,
			environments: [],
			maxConcurrency: Infinity,
			reporters: [ RunnerReporter ],
			runnerClientReporter: {
				id: 'WebDriver'
			},
			tunnel: NullTunnel,
			tunnelOptions: {
				tunnelId: String(Date.now())
			}
		}, config);

		super(config);

		this._fixConfig();
	}

	run() {
		// If we're only runnning the proxy, we want to stop after kicking off the proxy
		if (this.config.proxyOnly) {
			return this._beforeRun();
		}

		return super.run();
	}

	protected _afterRun() {
		const self = this;

		function stopProxy() {
			// `proxy` will not be set if `createAndStartProxy` call fails
			if (self.proxy) {
				return self.proxy.stop().then(function () {
					return self.reporterManager.emit('proxyEnd', self.proxy);
				});
			}
		}

		function stopTunnel() {
			if (self.tunnel && self.tunnel.isRunning) {
				return self.tunnel.stop().then(function () {
					return self.reporterManager.emit('tunnelEnd', self.tunnel);
				});
			}
		}

		return super._afterRun()
			.finally<any>(function () {
				return DojoPromise.all([
					stopProxy(),
					stopTunnel()
				])
				// We do not want to actually return an array of values, so chain a callback that resolves to
				// undefined
				.then(function () {});
			})
			.finally<any>(() => {
				this.reporterManager.empty();
			});
	}

	protected _beforeRun() {
		const self = this;
		const config = this.config;
		const reporterManager = this.reporterManager;

		function createAndStartProxy() {
			const proxy = self._createProxy(config);
			return proxy.start().then(function () {
				self.proxy = proxy;
				return reporterManager.emit('proxyStart', proxy);
			});
		}

		function startTunnel() {
			const tunnel = self.tunnel;
			tunnel.on('downloadprogress', function (progress: any) {
				reporterManager.emit('tunnelDownloadProgress', tunnel, progress);
			});
			tunnel.on('status', function (status: any) {
				reporterManager.emit('tunnelStatus', tunnel, status);
			});

			config.capabilities = deepMixin(tunnel.extraCapabilities, config.capabilities);

			return tunnel.start().then(function () {
				return reporterManager.emit('tunnelStart', tunnel);
			});
		}

		const promise = super._beforeRun().then(createAndStartProxy);

		if (config.proxyOnly) {
			return promise.then(function () {
				return DojoPromise.resolve(config.setup && config.setup.call(config, self))
					.then(function () {
						// Pause indefinitely until canceled
						return new DojoPromise(function () {});
					})
					.finally<any>(function () {
						return DojoPromise.resolve(config.teardown && config.teardown.call(config, self));
					})
					.finally<any>(function () {
						return self.proxy && self.proxy.stop();
					});
			});
		}

		return promise
			.then(startTunnel);
	}

	/**
	 * Creates suites for each environment in which tests will be executed.
	 *
	 * @param config Intern configuration.
	 * @param tunnel A Dig Dug tunnel.
	 * @param overrides Overrides to the user configuration provided via command-line.
	 * @returns An array of root suites.
	 */
	protected _createSuites(config: Config, tunnel: Tunnel, overrides: { [key: string]: string }) {
		const proxy = this.proxy;
		const reporterManager = this.reporterManager;
		const server = new Server(tunnel.clientUrl, {
			proxy: tunnel.proxy
		});
		server.sessionConstructor = ProxiedSession;

		// TODO: The Promise.resolve check is just to get around some Task-related typing issues with
		// Tunnel#getEnvironments.
		return Promise.resolve(tunnel.getEnvironments()).then(function (tunnelEnvironments) {
			return resolveEnvironments(
				config.capabilities,
				config.environments,
				tunnelEnvironments
			).map(function (environmentType): Suite {
				const suite = new Suite({
					name: String(environmentType),
					reporterManager: reporterManager,
					publishAfterSetup: true,
					grep: config.grep,
					bail: config.bail,
					timeout: config.defaultTimeout,

					setup: function () {
						return util.retry(function () {
							return server.createSession(environmentType);
						}, config.environmentRetries).then(function (session: ProxiedSession) {
							session.coverageEnabled = config.excludeInstrumentation !== true;
							session.coverageVariable = config.instrumenterOptions.coverageVariable;
							session.proxyUrl = config.proxyUrl;
							session.proxyBasePathLength = config.basePath.length;
							session.reporterManager = reporterManager;

							let command: Remote = <Remote> new Command(session);
							command.environmentType = new EnvironmentType(session.capabilities);

							suite.remote = command;
							// TODO: Document or remove sessionStart/sessionEnd.
							return reporterManager.emit('sessionStart', command);
						});
					},

					teardown: function (this: Suite): DojoPromise<any> {
						const remote = this.remote;

						function endSession() {
							return reporterManager.emit('sessionEnd', remote).then(function () {
								return tunnel.sendJobState(remote.session.sessionId, {
									success: suite.numFailedTests === 0 && !suite.error
								});
							});
						}

						if (remote) {
							if (
								config.leaveRemoteOpen === true ||
								(config.leaveRemoteOpen === 'fail' && this.numFailedTests > 0)
							) {
								return endSession();
							}

							// A Command behaves like a Promise for our needs
							return <any> remote.quit().finally(endSession);
						}
					}
				});

				// The `suites` flag specified on the command-line as an empty string will just get converted to an
				// empty array in the client, which means we can skip the client tests entirely. Otherwise, if no
				// suites were specified on the command-line, we rely on the existence of `config.suites` to decide
				// whether or not to client suites. If `config.suites` is truthy, it may be an empty array on the
				// Node.js side but could be a populated array when it gets to the browser side (conditional based
				// on environment), so we require users to explicitly set it to a falsy value to assure the test
				// system that it should not run the client
				if (config.suites) {
					suite.tests.push(new RemoteSuite({
						args: overrides,
						config: config,
						parent: suite,
						proxy: proxy
					}));
				}

				return suite;
			});
		});
	}

	/**
	 * Creates an instrumenting proxy for sending instrumented code to the remote environment and receiving
	 * data back from the remote environment.
	 *
	 * @param config The Intern configuration object.
	 * @returns A proxy.
	 */
	protected _createProxy(config: Config) {
		return new Proxy({
			basePath: config.basePath,
			instrumenterOptions: config.instrumenterOptions,
			excludeInstrumentation: config.excludeInstrumentation,
			instrument: true,
			waitForRunner: config.runnerClientReporter.waitForRunner,
			port: config.proxyPort
		});
	}

	/**
	 * Fixes up the configuration object with extra information specific to this executor.
	 */
	protected _fixConfig() {
		/* jshint node:true */
		const config = this.config;

		if (!config.capabilities.name) {
			config.capabilities.name = config.config;
		}

		const buildId = process.env.TRAVIS_COMMIT || process.env.BUILD_TAG;
		if (buildId) {
			config.capabilities.build = buildId;
		}

		config.proxyUrl = config.proxyUrl.replace(/\/*$/, '/');

		config.tunnelOptions.servers = (config.tunnelOptions.servers || []).concat(config.proxyUrl);
	}

	/**
	 * Loads a Dig Dug tunnel.
	 *
	 * @param config The Intern configuration object.
	 * @returns {module:digdug/Tunnel} A Dig Dug tunnel.
	 */
	// protected _loadTunnel(config: Config) {
	// 	const reporterManager = this.reporterManager;
	// 	const TunnelClass = this.tunnel;

	// 	// Tunnel only copies own property values from the config object, so make a flat
	// 	// copy of config.tunnelOptions (it's a delegate)
	// 	const tunnelOptions = deepMixin({}, config.tunnelOptions);
	// 	const tunnel = new TunnelClass(tunnelOptions);

	// 	tunnel.on('downloadprogress', function (progress: any) {
	// 		reporterManager.emit('tunnelDownloadProgress', tunnel, progress);
	// 	});
	// 	tunnel.on('status', function (status: any) {
	// 		reporterManager.emit('tunnelStatus', tunnel, status);
	// 	});

	// 	config.capabilities = deepMixin(tunnel.extraCapabilities, config.capabilities);

	// 	return tunnel;
	// }
}
