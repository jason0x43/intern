import { Config as BaseConfig, Events as BaseEvents, GenericExecutor } from './Executor';
import Tunnel, { TunnelOptions } from 'digdug/Tunnel';
import BrowserStackTunnel, { BrowserStackOptions } from 'digdug/BrowserStackTunnel';
import SeleniumTunnel, { SeleniumOptions } from 'digdug/SeleniumTunnel';
import SauceLabsTunnel from 'digdug/SauceLabsTunnel';
import TestingBotTunnel from 'digdug/TestingBotTunnel';
import CrossBrowserTestingTunnel from 'digdug/CrossBrowserTestingTunnel';
import NullTunnel from 'digdug/NullTunnel';
import Server from '../Server';
import Formatter from '../node/Formatter';
import { deepMixin } from 'dojo-core/lang';
import Reporter from '../reporters/Reporter';
import Runner from '../reporters/Runner';
import Pretty from '../reporters/Pretty';
import Task from 'dojo-core/async/Task';
import LeadfootServer from 'leadfoot/Server';
import ProxiedSession from '../ProxiedSession';
import resolveEnvironments from '../resolveEnvironments';
import Suite from '../Suite';
import RemoteSuite from '../RemoteSuite';
import { pullFromArray, retry } from '../util';
import global from 'dojo-core/global';
import EnvironmentType from '../EnvironmentType';
import Command from 'leadfoot/Command';

/**
 * The WebDriver executor is used to run unit tests in a remote browser, and to run functional tests against a remote
 * browser, using the WebDriver protocol.
 *
 * Unit and functional tests are handled fundamentally differently. Unit tests are only handled as module names here;
 * they will be loaded in a remote browser session, not in this executor. Functional tests, on the other hand, are loaded
 * and executed directly in this executor.
 */
export default class WebDriver extends GenericExecutor<Events, Config> {
	config: Config;

	server: Server;

	tunnel: Tunnel;

	protected _rootSuites: Suite[];

	constructor(config: Config) {
		const defaults: Partial<Config> = {
			capabilities: { 'idle-timeout': 60 },
			contactTimeout: 5000,
			environmentRetries: 3,
			environments: [],
			maxConcurrency: Infinity,
			reporters: ['runner'],
			tunnel: NullTunnel,
			tunnelOptions: { tunnelId: String(Date.now()) }
		};

		super(deepMixin(defaults, config));

		this._formatter = new Formatter(config);
	}

	protected _afterRun() {
		return super._afterRun()
			.finally(() => {
				const promises: Promise<any>[] = [];
				if (this.server) {
					promises.push(this.server.stop().then(() => this.emit('serverEnd', this.server)));
				}
				if (this.tunnel) {
					promises.push(this.tunnel.stop().then(() => this.emit('tunnelStop', { tunnel: this.tunnel })));
				}
				return Promise.all(promises)
					// We do not want to actually return an array of values, so chain a callback that resolves to
					// undefined
					.then(() => {});
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

		if (!config.serverPort) {
			config.serverPort = 9000;
		}

		if (!config.serverUrl) {
			config.serverUrl = 'http://localhost:' + config.serverPort;
		}

		if (!config.basePath) {
			config.basePath = process.cwd();
		}

		config.serverUrl = config.serverUrl.replace(/\/*$/, '/');

		if (config.tunnel === BrowserStackTunnel || config.tunnel === 'browserstack') {
			const options = <BrowserStackOptions>config.tunnelOptions;
			options.servers = (options.servers || []).concat(config.serverUrl);
		}

		const promise = super._beforeRun().then(() => {
			const server = this._createServer();
			return server.start().then(() => {
				this.server = server;
				return this.emit('serverStart', server);
			});
		});

		// If we're in serveOnly mode, just start the server server. Don't create session suites or start a tunnel.
		if (config.serveOnly) {
			return promise.then(() => {
				// This is normally handled in Executor#run, but in serveOnly mode we short circuit the normal sequence
				return Task.resolve(config.setup && config.setup.call(config, this))
					.then(function () {
						// Pause indefinitely until canceled
						return new Promise(function () { });
					})
					.finally(() => {
						return Task.resolve(config.teardown && config.teardown.call(config, this));
					})
					.finally(() => {
						return this.server && this.server.stop();
					});
			});
		}

		if (!config.suites) {
			config.suites = [];
		}

		return promise
			.then(() => {
				let TunnelConstructor: typeof Tunnel;
				if (typeof config.tunnel === 'string') {
					TunnelConstructor = Tunnels[config.tunnel];
				}
				else {
					TunnelConstructor = config.tunnel;
				}
				this.tunnel = new TunnelConstructor(this.config.tunnelOptions);
			})
			.then(() => this._createSessionSuites())
			.then(() => {
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
	 * Creates an instrumenting server for sending instrumented code to the remote environment and receiving
	 * data back from the remote environment.
	 */
	protected _createServer() {
		// Need an explicitly declared variable for typing
		const server: Server = new Server({
			basePath: this.config.basePath,
			instrumenterOptions: this.config.instrumenterOptions,
			excludeInstrumentation: this.config.excludeInstrumentation,
			executor: this,
			instrument: true,
			port: this.config.serverPort,
			runInSync: this.config.runInSync,
			socketPort: this.config.socketPort
		});
		return server;
	}

	/**
	 * Creates suites for each environment in which tests will be executed.
	 */
	protected _createSessionSuites() {
		const config = this.config;

		if (config.environments.length === 0) {
			this._rootSuites = [];
			return;
		}

		const server = this.server;
		const tunnel = this.tunnel;
		const leadfootServer = new LeadfootServer(tunnel.clientUrl, {
			proxy: tunnel.proxy
		});

		leadfootServer.sessionConstructor = ProxiedSession;

		// TODO: The Promise.resolve check is just to get around some Task-related typing issues with
		// Tunnel#getEnvironments.
		return Promise.resolve(tunnel.getEnvironments()).then(tunnelEnvironments => {
			const executor = this;

			this._rootSuites = resolveEnvironments(
				config.capabilities,
				config.environments,
				tunnelEnvironments
			).map(environmentType => {
				// Create a new root suite for each environment
				const suite = new Suite({
					name: String(environmentType),
					publishAfterSetup: true,
					grep: config.grep,
					bail: config.bail,
					tests: [],
					timeout: config.defaultTimeout,
					executor: this,

					before() {
						return retry<ProxiedSession>(
							() => leadfootServer.createSession(environmentType),
							config.environmentRetries
						).then(session => {
							session.executor = executor;
							session.coverageEnabled = config.excludeInstrumentation !== true;
							session.coverageVariable = config.instrumenterOptions.coverageVariable;
							session.serverUrl = config.serverUrl;
							session.serverBasePathLength = config.basePath.length;

							// TODO: Find a better way to handle the fact that session is mixed into the new Command
							// instance (better than just casting to Remote)
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

				// If functional tests were added to this executor, they will be in the root suite; add them to the
				// session suite.
				if (this._rootSuite) {
					this._rootSuite.name = 'functional tests';
					suite.add(this._rootSuite);
				}

				// If unit tests were added to this executor, wrap them in a RemoteSuite and add that to the session
				// suite.
				if (config.suites.length > 0) {
					suite.add(new RemoteSuite({
						contactTimeout: config.contactTimeout,
						name: 'unit tests',
						suites: config.suites,
						loader: config.loader,
						loaderConfig: config.loaderConfig,
						server
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

	protected _processOption(name: keyof Config, value: any) {
		switch (name) {
			case 'basePath':
			case 'loader':
			case 'serverUrl':
				if (typeof value !== 'string') {
					throw new Error(`Non-string value "${value}" for ${name}`);
				}
				// Ensure basePath ends with a '/'
				if (name === 'basePath' && value[value.length - 1] !== '/') {
					value += '/';
				}
				this.config[name] = value;
				break;

			case 'capabilities':
			case 'environments':
			case 'loaderConfig':
			case 'tunnelOptions':
				if (typeof value !== 'object') {
					throw new Error(`Non-object value "${value}" for ${name}`);
				}
				this.config[name] = value;
				break;

			case 'tunnel':
				if (typeof value === 'string') {
					value = Tunnels[<keyof typeof Tunnels>value];
					if (!value) {
						throw new Error(`Invalid tunnel name ${value}`);
					}
				}
				if (typeof value !== 'function') {
					throw new Error(`Non-constructor value "${value}" for ${name}`);
				}
				this.config[name] = value;
				break;

			case 'leaveRemoteOpen':
			case 'serveOnly':
			case 'runInSync':
				if (value === 'true') {
					this.config[name] = true;
				}
				else if (typeof value !== 'boolean') {
					throw new Error(`Non-boolean value "${value}" for ${name}`);
				}
				this.config[name] = value;
				break;

			case 'suites':
				if (!Array.isArray(value)) {
					throw new Error(`Non-array value "${value}" for ${name}`);
				}
				this.config[name] = value;
				break;

			case 'contactTimeout':
			case 'maxConcurrency':
			case 'environmentRetries':
			case 'serverPort':
			case 'socketPort':
				const numValue = Number(value);
				if (isNaN(numValue)) {
					throw new Error(`Non-numeric value "${value}" for ${name}`);
				}
				this.config[name] = numValue;
				break;

			default:
				super._processOption(name, value);
		}
	}

	/**
	 * Runs each of the root suites, limited to a certain number of suites at the same time by `maxConcurrency`.
	 */
	protected _runTests(): Task<any> {
		const rootSuites = this._rootSuites;
		const queue = new FunctionQueue(this.config.maxConcurrency || Infinity);
		const numSuitesToRun = rootSuites.length;
		let numSuitesCompleted = 0;

		return Task.all(rootSuites.map(suite => {
			return queue.enqueue(() => {
				return suite.run().finally(() => {
					numSuitesCompleted++;
					if (numSuitesCompleted === numSuitesToRun) {
						const coverage = global[this.config.instrumenterOptions.coverageVariable];
						if (coverage) {
							return this.emit('coverage', { coverage });
						}
					}
				});
			});
		}));
	}
}

export const Tunnels = {
	'null': NullTunnel,
	browserstack: BrowserStackTunnel,
	crossbrowsertesting: CrossBrowserTestingTunnel,
	saucelabs: SauceLabsTunnel,
	selenium: SeleniumTunnel,
	testingbot: TestingBotTunnel
};

export type TunnelNames = keyof typeof Tunnels;

export interface Config extends BaseConfig {
	basePath?: string;
	capabilities?: {
		name?: string;
		build?: string;
		[key: string]: any;
	};
	contactTimeout?: number;
	environments: any[];
	environmentRetries?: number;
	leaveRemoteOpen?: boolean | 'fail';
	loader?: string;
	loaderConfig?: { [key: string]: any };
	maxConcurrency?: number;
	serveOnly?: boolean;
	serverPort?: number;
	serverUrl?: string;
	runInSync?: boolean;
	socketPort?: number;
	tunnel?: TunnelNames | typeof Tunnel;
	tunnelOptions?: TunnelOptions | BrowserStackOptions | SeleniumOptions;

	/** A list of unit test suites that will be run in remote browsers */
	suites?: string[];
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
	debug: any;
	serverEnd: Server;
	serverStart: Server;
	sessionStart: Remote;
	sessionEnd: Remote;
	tunnelDownloadProgress: TunnelMessage;
	tunnelStart: TunnelMessage;
	tunnelStatus: TunnelMessage;
	tunnelStop: TunnelMessage;
};

/**
 * A basic FIFO function queue to limit the number of currently executing asynchronous functions.
 */
class FunctionQueue {
	readonly maxConcurrency: number;
	queue: any[];
	activeTasks: Task<any>[];
	funcTasks: Task<any>[];

	constructor(maxConcurrency: number) {
		this.maxConcurrency = maxConcurrency;
		this.queue = [];
		this.activeTasks = [];
		this.funcTasks = [];
	}

	enqueue(func: () => Task<any>) {
		let resolver: (value?: any) => void;
		let rejecter: (error?: Error) => void;

		const funcTask = new Task((resolve, reject) => {
			resolver = resolve;
			rejecter = reject;
		});
		this.funcTasks.push(funcTask);

		this.queue.push({ func, resolver, rejecter });
		if (this.activeTasks.length < this.maxConcurrency) {
			this.next();
		}

		return funcTask;
	}

	clear() {
		this.activeTasks.forEach(task => task.cancel());
		this.funcTasks.forEach(task => task.cancel());
		this.activeTasks = [];
		this.funcTasks = [];
		this.queue = [];
	}

	next() {
		if (this.queue.length > 0) {
			const { func, resolver, rejecter } = this.queue.shift();
			const task = func().then(resolver, rejecter).finally(() => {
				// Remove the task from the active task list and kick off the next task
				pullFromArray(this.activeTasks, task);
				this.next();
			});
			this.activeTasks.push(task);
		}
	}
}
