import Executor, { Config as BaseConfig, Events } from './Executor';
import Formatter from '../browser/Formatter';
import Reporter from '../reporters/Reporter';
import Html from '../reporters/Html';
import Console from '../reporters/Console';
import Suite from '../Suite';

/**
 * The Browser executor is used to run unit tests in a browser.
 */
export default class Browser extends Executor<Events> {
	constructor(config?: Config) {
		config = config || {};

		if (!config.basePath) {
			const basePath = getThisPath().split('/').slice(0, -1).join('/');

			// TODO: don't do this in the final version
			const devBasePath = basePath.split('/').slice(0, -1).concat('src').join('/');
			config.basePath = devBasePath;
		}

		super(config);

		this._formatter = new Formatter(config);
		this._rootSuites = [ new Suite({ name: null, executor: this }) ];
		this._reporters.push(new Html(this));
	}

	get config(): Config {
		return this._config;
	}

	/**
	 * Resolve a path that's relative to the project root to one that's relative to the Intern root.
	 */
	resolvePath(_path: string) {
		return `${this.config.basePath}/${_path}`;
	}

	protected _getReporter(name: string): typeof Reporter {
		switch (name) {
			case 'html':
				return Html;
			case 'console':
				return Console;
		}
	}
}

export { Events }

export interface Config extends BaseConfig {
	basePath?: string;
}

function getThisPath() {
	const scripts = document.getElementsByTagName('script');
	let script: HTMLScriptElement;
	for (let i = 0; i < scripts.length; i++) {
		script = scripts[i];
		if (/\/browser\.js\b/.test(script.src)) {
			return script.src;
		}
	}
}
