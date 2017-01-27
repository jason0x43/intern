import Executor, { Config as BaseConfig, Events } from './Executor';
import Suite from '../Suite';
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
export default class Node extends Executor<Events> {
	readonly config: Config;

	constructor(config: Config) {
		super(config);

		if (this.config.excludeInstrumentation == null) {
			this.config.excludeInstrumentation = /(?:node_modules|tests)\//;
		}

		this._rootSuites = [ new Suite({
			executor: this,
			name: this.config.rootSuiteName || 'root'
		}) ];

		this._formatter = new Formatter(config);

		if (this.config.excludeInstrumentation !== true) {
			this._setInstrumentationHooks(this.config.excludeInstrumentation);
		}
	}

	protected _beforeRun(): Task<void> {
		return super._beforeRun().then(() => {
			if (this._reporters.length === 0) {
				this._reporters.push(new Simple(this));
			}

			const suite = this._rootSuites[0];
			suite.name = this.config.rootSuiteName || null;
			suite.grep = this.config.grep;
			// TODO: Does node need a session ID?
			suite.sessionId = this.config.sessionId;
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
	sessionId?: string;
}

export { Events };
