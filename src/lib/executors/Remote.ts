import { Config as BaseConfig, Events, GenericBrowser } from './Browser';
import { initialize } from './Executor';
import Channel, { isChannel } from '../Channel';
import Task from 'dojo-core/async/Task';

/**
 * An executor for running suites in a remote browser
 */
export default class Remote extends GenericBrowser<Events, Config> {
	static initialize(config?: Config) {
		return initialize<Events, Config, Remote>(Remote, config);
	}

	protected _channel: Channel;

	protected _debug: boolean;

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
	internBasePath?: string;
	sessionId?: string;
}
