import { Config as BaseConfig, Events, GenericExecutor } from './Executor';
import Task from 'dojo-core/async/Task';
import { instrument } from '../instrument';
import { normalizePath } from '../node/util';
import Formatter from '../node/Formatter';
import { resolve, sep } from 'path';
import { hook } from 'istanbul';
import Reporter from '../reporters/Reporter';
import Pretty from '../reporters/Pretty';
import Simple from '../reporters/Simple';

/**
 * The Node executor is used to run unit tests in a Node environment.
 */
export default class Node extends GenericExecutor<Events, Config> {
	readonly config: Config;

	constructor(config: Config) {
		super(config);

		if (this.config.excludeInstrumentation == null) {
			this.config.excludeInstrumentation = /(?:node_modules|tests)\//;
		}

		this._formatter = new Formatter(config);

		if (typeof this.config.excludeInstrumentation === 'undefined') {
			this.config.excludeInstrumentation = /(?:node_modules|tests)\//;
		}

		if (this.config.excludeInstrumentation !== true) {
			this._setInstrumentationHooks(this.config.excludeInstrumentation);
		}
	}

	protected _beforeRun(): Task<void> {
		return super._beforeRun().then(() => {
			if (this._reporters.length === 0) {
				this._reporters.push(new Simple(this));
			}

			const suite = this._rootSuite;
			suite.name = this.config.rootSuiteName || null;
			suite.grep = this.config.grep;
			suite.timeout = this.config.defaultTimeout;
			suite.bail = this.config.bail;
		});
	}

	protected _getReporter(name: string): typeof Reporter {
		switch (name) {
			case 'simple':
				return Simple;
			case 'pretty':
				return Pretty;
		}
	}

	/**
	 * Adds hooks for code coverage instrumentation in the Node.js loader.
	 */
	protected _setInstrumentationHooks(excludeInstrumentation: RegExp) {
		const { instrumenterOptions } = this.config;
		const basePath = normalizePath(resolve(this.config.basePath || '') + sep);

		function shouldHook(filename: string) {
			filename = normalizePath(filename);

			return filename.indexOf(basePath) === 0 &&
				// if the string passed to `excludeInstrumentation` changes here, it must also change in
				// `lib/Proxy.js`
				!excludeInstrumentation.test(filename.slice(basePath.length));
		}

		function instrumentCode(code: string, filename: string) {
			return instrument(code, resolve(filename), instrumenterOptions);
		}

		hook.hookRunInThisContext(shouldHook, instrumentCode);
		hook.hookRequire(shouldHook, instrumentCode);
	}

	protected _removeInstrumentationHooks() {
		hook.unhookRunInThisContext();
		hook.unhookRequire();
	}
}

export interface Config extends BaseConfig {
	basePath?: string;
	globalName?: string;
	rootSuiteName?: string;
}

export { Events };