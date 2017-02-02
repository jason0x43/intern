import { Config as BaseConfig, Events, GenericBrowser } from './Browser';
import Channel, { isChannel } from '../Channel';
import Task from 'dojo-core/async/Task';

/**
 * An executor for running suites in a remote browser
 */
export default class Remote extends GenericBrowser<Events, Config> {
	protected _channel: Channel;

	protected _debug: boolean;

	protected _initializers: Promise<any>[];

	constructor(config: Config) {
		super(config);
		this._initializers = [];
	}

	get channel() {
		return this._channel;
	}

	/**
	 * Add an intializer promise to Intern.
	 */
	addInitializer(promise: Promise<any>) {
		this._initializers.push(promise);
	}

	/**
	 * Send debug messages to the Intern host
	 */
	debug(data: any) {
		if (this._debug && this.channel) {
			return this.channel.sendMessage('debug', data);
		}
	}

	run() {
		return this.waitForInitializers().then(() => super.run());
	}

	/**
	 * Return a Task that resolves when all initializers have completed.
	 */
	waitForInitializers() {
		return Task.all(this._initializers);
	}

	protected _getThisPath() {
		const scripts = document.getElementsByTagName('script');
		let script: HTMLScriptElement;
		for (let i = 0; i < scripts.length; i++) {
			script = scripts[i];
			if (/\/remote\.js$/.test(script.src)) {
				return script.src;
			}
		}
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

			case 'sessionId':
				if (typeof value !== 'string') {
					throw new Error(`${name} must be a string`);
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
	sessionId?: string;
}
