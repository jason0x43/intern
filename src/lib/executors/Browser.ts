import { Config as BaseConfig, Events, GenericExecutor, initialize } from './Executor';
import Formatter from '../browser/Formatter';
import Task from 'dojo-core/async/Task';

export class GenericBrowser<E extends Events, C extends Config> extends GenericExecutor<E, C> {
	constructor(config: C) {
		super(config);

		if (!this.config.basePath) {
			this.config.basePath = '/';
		}

		this._internPath = this.config.basePath + 'node_modules/intern/';
		this._formatter = new Formatter(config);
	}

	get environmentType() {
		return 'browser';
	}

	/**
	 * Load a script or scripts via script injection.
	 *
	 * @param script a path to a script
	 */
	loadScript(script: string | string[]) {
		if (script == null) {
			return Task.resolve();
		}

		if (typeof script === 'string') {
			script = [script];
		}

		return script.reduce((previous, script) => {
			script = normalizePath(script, this.config.basePath);
			return previous.then(() => injectScript(script));
		}, Task.resolve());
	}

	protected _beforeRun(): Task<any> {
		return super._beforeRun().then(() => {
			const config = this.config;
			for (let suite of config.suites) {
				if (/[*?]/.test(suite)) {
					throw new Error(`Globs may not be used for browser suites: "${suite}"`);
				}
			}
		});
	}

	protected _processOption(name: keyof Config, value: any) {
		switch (name) {
			case 'basePath':
				if (typeof value !== 'string') {
					throw new Error(`${name} must be a string`);
				}
				// Ensure paths end with a '/'
				if (value[value.length - 1] !== '/') {
					value += '/';
				}
				this.config[name] = value;
				break;

			default:
				super._processOption(name, value);
				break;
		}
	}
}

/**
 * The Browser executor is used to run unit tests in a browser.
 */
export default class Browser extends GenericBrowser<Events, Config> {
	static initialize(config?: Config) {
		return initialize<Events, Config, Browser>(Browser, config);
	}
}

export interface Config extends BaseConfig {
	/** The absolute path to the project base (defaults to '/') */
	basePath?: string;
}

export { Events };

function normalizePath(path: string, basePath: string) {
	// If path isn't absolute, assume it's relative to basePath
	return path[0] !== '/' ? basePath + path : path;
}

function injectScript(path: string) {
	return new Task<void>((resolve, reject) => {
		const scriptTag = document.createElement('script');
		scriptTag.addEventListener('load', () => {
			resolve();
		});
		scriptTag.addEventListener('error', event => {
			console.error(`Error loading ${path}:`, event);
			reject(new Error(`Unable to load ${path}`));
		});
		scriptTag.src = path;
		document.body.appendChild(scriptTag);
	});
}
