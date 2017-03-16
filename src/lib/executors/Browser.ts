import { Config as BaseConfig, Events, GenericExecutor, initialize } from './Executor';
import Formatter from '../browser/Formatter';
import Reporter from '../reporters/Reporter';
import Html from '../reporters/Html';
import Console from '../reporters/Console';
import Task from 'dojo-core/async/Task';

export class GenericBrowser<E extends Events, C extends Config> extends GenericExecutor<E, C> {
	basePath: string;

	internBasePath: string;

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
		return 'browser/intern.js';
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
			script = normalizePath(script, this.basePath);
			return previous.then(() => injectScript(script));
		}, Task.resolve());
	}

	/**
	 * Parse a query string into an object.
	 */
	parseQuery(query?: string) {
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
