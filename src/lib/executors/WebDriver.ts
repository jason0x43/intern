import Executor, { Config as BaseConfig, Events as BaseEvents } from './Executor';
import Tunnel, { TunnelOptions } from 'digdug/Tunnel';
import NullTunnel from 'digdug/NullTunnel';
import Proxy from '../Proxy';
import { deepMixin } from 'dojo-core/lang';
import Reporter from '../reporters/Reporter';
import Runner from '../reporters/Runner';
import Pretty from '../reporters/Pretty';
import Task from 'dojo-core/async/Task';

export interface Config extends BaseConfig {
	capabilities: {
		name?: string;
		build?: string;
		[key: string]: any;
	};
	environments: any[];
	environmentRetries: number;
	proxy: Proxy;
	proxyOnly: boolean;
	proxyPort: number;
	proxyUrl: string;
	runnerClientReporter: {
		reporter: string | Reporter;
		waitForRunner?: boolean;
	};
	tunnel: typeof Tunnel;
	tunnelOptions: TunnelOptions & { servers?: string[] };
}

export interface TunnelMessage {
	tunnel: Tunnel;
	progress?: any;
	status?: string;
}

export interface Events extends BaseEvents {
	tunnelDownloadProgress: TunnelMessage;
	tunnelStatus: TunnelMessage;
	tunnelStart: TunnelMessage;
	proxyStart: Proxy;
};

export default class WebDriver extends Executor<Events> {
	config: Config;

	proxy: Proxy;

	tunnel: Tunnel;

	protected _defaultReporter: Reporter;

	constructor(config: Partial<Config> = {}) {
		const defaults: Partial<Config> = {
			capabilities: {
				'idle-timeout': 60
			},
			environmentRetries: 3,
			environments: [],
			maxConcurrency: Infinity,
			reporters: [ 'runner' ],
			runnerClientReporter: { reporter: 'webdriver' },
			tunnel: NullTunnel,
			tunnelOptions: {
				tunnelId: String(Date.now())
			}
		};

		super(deepMixin(defaults, config));
	}

	protected _beforeRun(): Task<any> {
		const config = this.config;

		if (!this._listeners['testEnd']) {
			this._defaultReporter = new Runner(this);
		}

		const promise = super._beforeRun().then(() => {
			const proxy = this._createProxy();
			return proxy.start().then(() => {
				this.proxy = proxy;
				return this.emit('proxyStart', proxy);
			});
		});

		if (config.proxyOnly) {
			return promise.then(() => {
				return Task.resolve(config.setup && config.setup.call(config, this))
					.then(function () {
						// Pause indefinitely until canceled
						return new Promise(function () {});
					})
					.finally(() => {
						return Task.resolve(config.teardown && config.teardown.call(config, this));
					})
					.finally(() => {
						return this.proxy && this.proxy.stop();
					});
			});
		}

		return promise.then(() => {
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

	protected _configure(cfg: Config) {
		super._configure(cfg);

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
	}

	/**
	 * Creates an instrumenting proxy for sending instrumented code to the remote environment and receiving
	 * data back from the remote environment.
	 *
	 * @param config The Intern configuration object.
	 * @returns A proxy.
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

	protected _getReporter(name: string): typeof Reporter {
		switch (name) {
			case 'runner':
				return Runner;
			case 'pretty':
				return Pretty;
		}
	}
}
