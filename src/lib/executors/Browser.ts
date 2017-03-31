import { Config as BaseConfig, Events, GenericExecutor, initialize } from './Executor';
import { normalizePath, parseValue } from '../common/util';
import Formatter from '../browser/Formatter';
import Task from 'dojo-core/async/Task';

export class GenericBrowser<E extends Events, C extends Config> extends GenericExecutor<E, C> {
	constructor(config: C) {
		super(config);

		this._formatter = new Formatter(config);
	}

	get environment() {
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
			if (script[0] !== '/') {
				script = `${this.config.basePath}${script}`;
			}
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
				this.config[name] = parseValue(name, value, 'string');
				break;

			default:
				super._processOption(name, value);
				break;
		}
	}

	protected _resolveConfig() {
		return super._resolveConfig().then(() => {
			const config = this.config;
			if (!config.basePath) {
				config.basePath = '/';
			}

			if (!config.internPath) {
				config.internPath = config.basePath + 'node_modules/intern/';
			}

			[ 'basePath', 'internPath' ].forEach(key => {
				config[key] = normalizePath(config[key]);
			});
		});
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
