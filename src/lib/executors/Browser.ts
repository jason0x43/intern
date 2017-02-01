import { Config as BaseConfig, Events, GenericExecutor } from './Executor';
import Formatter from '../browser/Formatter';
import Reporter from '../reporters/Reporter';
import Html from '../reporters/Html';
import Console from '../reporters/Console';
import Channel, { isChannel } from '../Channel';

/**
 * The Browser executor is used to run unit tests in a browser.
 */
export default class Browser extends GenericExecutor<Events, Config> {
	channel: Channel;

	constructor(config: Partial<Config> = {}) {
		if (!config.basePath) {
			const basePath = getThisPath().split('/').slice(0, -1).join('/');

			// TODO: don't do this in the final version
			const devBasePath = basePath.split('/').slice(0, -1).concat('src').join('/');
			config.basePath = devBasePath;
		}

		super(config);

		this._formatter = new Formatter(config);
		this._reporters.push(new Html(this));
	}

	get config(): Config {
		return this._config;
	}

	/**
	 * Can be called in a WebDriver context to send data back to an Intern host
	 */
	debug(_data: any) {
	}

	/**
	 * Resolve a path that's relative to the project root to one that's relative to the Intern root.
	 */
	resolvePath(path: string) {
		return `${this.config.basePath}/${path}`;
	}

	protected _getReporter(name: string): typeof Reporter {
		switch (name) {
			case 'html':
				return Html;
			case 'console':
				return Console;
		}
	}

	protected _processOption(name: keyof Config, value: any) {
		switch (name) {
			case 'basePath':
				if (typeof value !== 'string') {
					throw new Error(`${name} must be a string`);
				}
				this.config[name] = value;
				break;

			case 'channel':
				if (!isChannel(value)) {
					throw new Error(`${name} must be a Channel`);
				}
				this.channel = value;
				break;

			default:
				super._processOption(name, value);
				break;
		}
	}
}

export { Events }

export interface Config extends BaseConfig {
	basePath?: string;
	channel?: Channel;
}

function getThisPath() {
	const scripts = document.getElementsByTagName('script');
	let script: HTMLScriptElement;
	for (let i = 0; i < scripts.length; i++) {
		script = scripts[i];
		if (/\/browser\.js$/.test(script.src)) {
			return script.src;
		}
	}
}
