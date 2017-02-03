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

	get scriptName() {
		return '/browser/remote.js';
	}

	/**
	 * Send debug messages to the Intern host
	 */
	debug(...args: any[]) {
		if (this._debug && this.channel) {
			const message = args.map(arg => {
				const type = typeof arg;
				if (type === 'string') {
					return arg;
				}
				if (type === 'function' || arg instanceof RegExp) {
					return arg.toString();
				}
				if (arg instanceof Error) {
					arg = { name: arg.name, message: arg.message, stack: arg.stack };
				}
				return JSON.stringify(arg);
			}).join(' ');
			return this.channel.sendMessage('debug', message);
		}
	}

	/**
	 * Parse query params into an object
	 */
	getQueryParams(query?: string) {
		query = query || location.search.slice(1);
		const rawParams = query.split('&').filter(arg => {
			return arg !== '' && arg[0] !== '=';
		}).map(arg => {
			const parts = arg.split('=');
			return {
				name: decodeURIComponent(parts[0]),
				// An arg name with no value is treated as having the value 'true'
				value: (parts[1] && decodeURIComponent(parts[1])) || true
			};
		});

		const params: { [key: string]: any } = {};
		rawParams.forEach(({ name, value }) => {
			try {
				if (typeof value === 'string') {
					value = JSON.parse(value);
				}
			}
			catch (_error) {
				// ignore
			}

			if (!(name in params)) {
				params[name] = value;
			}
			else if (!Array.isArray(params[name])) {
				params[name] = [params[name], value];
			}
			else {
				params[name].push(value);
			}
		});

		return params;
	}

	/**
	 * Load a script via script injection.
	 *
	 * @param script an absolute path to a script (e.g., `intern.basePath + 'somedir/script.js'`)
	 */
	loadScript(script: string) {
		// If script isn't absolute, assume it's relative to basePath
		if (script[0] !== '/') {
			script = this.basePath + script;
		}

		return new Promise((resolve, reject) => {
			const scriptTag = document.createElement('script');
			scriptTag.addEventListener('load', resolve);
			scriptTag.addEventListener('error', event => {
				console.error(`Error loading ${script}:`, event);
				reject(new Error(`Unable to load ${script}`));
			});
			scriptTag.src = script;
			document.body.appendChild(scriptTag);
		});
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
