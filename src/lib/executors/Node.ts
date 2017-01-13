import { Config } from '../../common';
import Simple from '../reporters/Simple';
import Executor from './Executor';
import Suite from '../Suite';
import Task from 'dojo-core/async/Task';
import { instrument } from '../instrument';
import { normalizePath } from '../node/util';
import Formatter from '../node/Formatter';
import { resolve, sep } from 'path';
import { hook } from 'istanbul';

/**
 * The Node executor is used to run unit tests in a Node environment.
 */
export default class Node extends Executor {
	mode: 'client';

	constructor(config: Config) {
		super(config);

		if (this.config.excludeInstrumentation == null) {
			this.config.excludeInstrumentation = /(?:node_modules|tests)\//;
		}

		this._rootSuites = [new Suite({
			executor: this
		})];

		this._formatter = new Formatter(config);

		if (this._reporters.length === 0) {
			this.addReporter(new Simple());
		}

		if (this.config.excludeInstrumentation !== true) {
			this._setInstrumentationHooks(this.config.excludeInstrumentation);
		}
	}

	protected _beforeRun(): Task<void> {
		return super._beforeRun().then(() => {
			const suite = this._rootSuites[0];
			suite.name = this.config.rootSuiteName || null;
			suite.grep = this.config.grep;
			suite.sessionId = this.config.sessionId;
			suite.timeout = this.config.defaultTimeout;
			suite.bail = this.config.bail;
		});
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
