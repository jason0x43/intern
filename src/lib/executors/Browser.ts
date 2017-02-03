import { Config as BaseConfig, Events, GenericExecutor } from './Executor';
import Formatter from '../browser/Formatter';
import Reporter from '../reporters/Reporter';
import Html from '../reporters/Html';
import Console from '../reporters/Console';

/**
 * The Browser executor is used to run unit tests in a browser.
 */
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
		return '/browser/browser.js';
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
				const internBasePath = scriptBase.slice(0, scriptBase.length - 'browser/browser.js'.length);
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

export default class Browser extends GenericBrowser<Events, Config> {}

export { Events }

export interface Config extends BaseConfig {
	/** The absolute path to the project base (defaults to '/') */
	basePath?: string;

	/** The absolute path to intern (will be auto-determined by default) */
	internBasePath?: string;
}
