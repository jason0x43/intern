import { Config as BaseConfig, Events, GenericExecutor, initialize } from './Executor';
import Formatter from '../browser/Formatter';
import Reporter from '../reporters/Reporter';
import Html from '../reporters/Html';
import Console from '../reporters/Console';

export class GenericBrowser<E extends Events, C extends Config> extends GenericExecutor<E, C> {
	basePath: string;

	internBasePath: string;

	private _queryParams: { [key: string]: any };

	constructor(config: C) {
		super(config);

		if (!this.basePath) {
			this.basePath = '/';
		}

		if (!this.internBasePath) {
			this.internBasePath = this._getInternBasePath();
		}

		this._formatter = new Formatter(config);
		this._reporters.push(new Html(this));
	}

	get scriptName() {
		return 'browser/runner.js';
	}

	/**
	 * Return the current query params as a lightly-formatted object
	 */
	get queryParams() {
		if (!this._queryParams) {
			const query = location.search.slice(1);
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

			// Ensure suites exists and is an array
			if (!params.suites) {
				params.suites = [];
			}
			else if (!Array.isArray(params.suites)) {
				params.suites = [params.suites];
			}

			// Ensure loaderConfig is defined if a loader is being used
			if (params.loader && !params.loaderConfig) {
				params.loaderConfig = {};
			}

			this._queryParams = Object.freeze(params);
		}

		return this._queryParams;
	}

	/**
	 * Load a script or scripts via script injection.
	 *
	 * @param script a path to a script
	 */
	loadScript(...scripts: string[]) {
		return Promise.all(scripts.map(script => injectScript(script, this.basePath)));
	}

	protected _getReporter(name: string): typeof Reporter {
		switch (name) {
			case 'html':
				return Html;
			case 'console':
				return Console;
		}
	}

	protected _getInternBasePath() {
		const scripts = document.getElementsByTagName('script');
		const host = /https?:\/\/[^\/]+(?:\/)/.exec(document.baseURI)[0];

		// The path of the script containing this code within intern
		const scriptName = this.scriptName;

		let script: HTMLScriptElement;
		for (let i = 0; i < scripts.length; i++) {
			script = scripts[i];
			const src = script.src;
			const targetPosition = src.length - scriptName.length;
			if (src.lastIndexOf(scriptName) === targetPosition) {
				const scriptBase = `/${src.slice(host.length)}`;
				const internBasePath = scriptBase.slice(0, scriptBase.length - this.scriptName.length);
				return internBasePath;
			}
		}

		throw new Error('Could not find script ' + scriptName);
	}

	protected _processOption(name: keyof Config, value: any) {
		switch (name) {
			case 'basePath':
			case 'internBasePath':
				if (typeof value !== 'string') {
					throw new Error(`${name} must be a string`);
				}
				// Ensure paths end with a '/'
				if (value[value.length - 1] !== '/') {
					value += '/';
				}
				this[name] = value;
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

export { Events }

export interface Config extends BaseConfig {
	/** The absolute path to the project base (defaults to '/') */
	basePath?: string;

	/** The absolute path to intern (will be auto-determined by default) */
	internBasePath?: string;
}

function injectScript(script: string, basePath: string) {
	// If script isn't absolute, assume it's relative to basePath
	if (script[0] !== '/') {
		script = basePath + script;
	}

	if (!(/\.js$/i).test(script)) {
		script += '.js';
	}

	return new Promise<void>((resolve, reject) => {
		const scriptTag = document.createElement('script');
		scriptTag.addEventListener('load', () => {
			resolve();
		});
		scriptTag.addEventListener('error', event => {
			console.error(`Error loading ${script}:`, event);
			reject(new Error(`Unable to load ${script}`));
		});
		scriptTag.src = script;
		document.body.appendChild(scriptTag);
	});
}
