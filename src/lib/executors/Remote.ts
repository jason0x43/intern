import { Config as BaseConfig, Events, GenericBrowser } from './Browser';
import { initialize } from './Executor';
import Channel, { isChannel } from '../Channel';
import WebSocketChannel from '../WebSocketChannel';
import Task from 'dojo-core/async/Task';

/**
 * An executor for running suites in a remote browser
 */
export default class Remote extends GenericBrowser<Events, Config> {
	static initialize(config?: Config) {
		const intern = initialize<Events, Config, Remote>(Remote, config);

		let runner = intern.config.runner || 'script';

		try {
			// Forward all executor events back to the Intern host
			intern.on('*', data => {
				let promise = intern.channel.sendMessage(data.name, data.data).catch(console.error);
				if (intern.config.runInSync) {
					return promise;
				}
			});

			intern.log('Using runner script', runner);
			intern.log('Intern base path:', intern.internBasePath);

			switch (runner) {
				case 'dojo':
				case 'dojo2':
				case 'script':
					runner = `${intern.internBasePath}/browser/runners/${runner}.js`;
					break;
			}

			intern.loadScript(runner).catch(error => {
				intern.emit('error', error);
			});
		}
		catch (error) {
			intern.emit('error', error);
		}
	}

	protected _channel: Channel;

	protected _debug: boolean;

	constructor(config: Config) {
		super(config);

		const params = this.parseQuery();
		if (params) {
			this.configure(params);
		}

		if (!this.channel) {
			if (this.config.socketPort) {
				this._channel = new WebSocketChannel({
					url: this.basePath,
					sessionId: this.config.sessionId,
					port: this.config.socketPort
				});
			}
			else {
				this._channel = new Channel({
					url: this.basePath,
					sessionId: this.config.sessionId
				});
			}
		}
	}

	get channel() {
		return this._channel;
	}

	get scriptName() {
		return '/browser/remote.js';
	}

	protected _emitCoverage(coverage: any): Task<any> {
		return this.emit('coverage', { sessionId: this.config.sessionId, coverage });
	}

	protected _processOption(name: keyof Config, value: any) {
		console.log('processing option ' + name);
		switch (name) {
			case 'channel':
				if (!isChannel(value)) {
					throw new Error(`${name} must be a Channel`);
				}
				this._channel = value;
				break;

			case 'debug':
			case 'runInSync':
				if (value === 'true') {
					value = true;
				}
				else if (value === 'false') {
					value = false;
				}
				if (typeof value !== 'boolean') {
					throw new Error(`${name} must be a boolean (${value} -> ${typeof value})`);
				}
				this._debug = value;
				break;

			case 'internBasePath':
			case 'runner':
			case 'sessionId':
				if (typeof value !== 'string') {
					throw new Error(`${name} must be a string`);
				}
				this.config[name] = value;
				break;

			case 'socketPort':
				if (typeof value !== 'number') {
					value = Number(value);
				}
				if (isNaN(value)) {
					throw new Error(`${name} must be a number`);
				}
				this.config[name] = value;
				break;

			case 'runnerConfig':
				if (typeof value !== 'object') {
					try {
						value = JSON.parse(value);
					}
					catch (error) {
						throw new Error(`${name} must be an object`);
					}
				}
				this.config[name] = value;
				break;

			case 'suites':
				if (typeof value === 'string') {
					value = [value];
				}
				if (!Array.isArray(value)) {
					throw new Error(`${name} must be an array of string`);
				}
				this.config[name] = value;
				break;

			default:
				super._processOption(name, value);
				break;
		}
	}
}

export { Events }

export interface Config extends BaseConfig {
	channel?: Channel;
	debug?: boolean;
	internBasePath?: string;
	runInSync?: boolean;
	runner?: string;
	runnerConfig?: object;
	sessionId?: string;
	socketPort?: number;
	suites?: string[];
}
