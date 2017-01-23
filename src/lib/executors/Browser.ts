import Executor, { Config as BaseConfig } from './Executor';
import Formatter from '../browser/Formatter';
import Reporter from '../reporters/Reporter';
import Html from '../reporters/Html';
import Console from '../reporters/Console';
import Suite from '../Suite';

export interface Config extends BaseConfig {
	basePath?: string;
}

export default class Browser extends Executor {
	protected _defaultReporters: Reporter[];

	constructor(config?: Config) {
		super(config);

		this._formatter = new Formatter(config);
		this._defaultReporters = [ new Html(this) ];
		this._rootSuites = [ new Suite({ executor: this }) ];
	}

	get config(): Config {
		return this._config;
	}

	configure(config: Config) {
		this._configure(config);
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
