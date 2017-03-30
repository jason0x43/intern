import { Config, Events, GenericExecutor, initialize } from './Executor';
import Task from 'dojo-core/async/Task';
import { instrument } from '../instrument';
import { expandFiles, loadScript, normalizePath, reportUnhandledRejections } from '../node/util';
import Formatter from '../node/Formatter';
import { dirname, resolve, relative, sep } from 'path';
import { hook } from 'istanbul';
import Pretty from '../reporters/Pretty';
import Simple from '../reporters/Simple';
import Promise from 'dojo-shim/Promise';

/**
 * The Node executor is used to run unit tests in a Node environment.
 */
export default class Node extends GenericExecutor<Events, Config> {
	static initialize(config?: Config) {
		return initialize<Events, Config, Node>(Node, config);
	}

	constructor(config: Config) {
		super(config);

		this.registerReporter('pretty', Pretty);
		this.registerReporter('simple', Simple);

		this._formatter = new Formatter(config);

		if (this.config.excludeInstrumentation !== true) {
			this._setInstrumentationHooks(this.config.excludeInstrumentation);
		}

		const internPath = resolve(dirname(require.resolve('intern/package.json')));
		this._internPath = `${relative(process.cwd(), internPath)}/`;

		reportUnhandledRejections(this);
	}

	get environmentType() {
		return 'node';
	}

	/**
	 * Load a script or scripts using Node's require.
	 *
	 * @param script a path to a script
	 */
	loadScript(script: string | string[]) {
		return loadScript(script);
	}

	protected _beforeRun(): Task<void> {
		return super._beforeRun().then(() => {
			const config = this.config;

			if (config.suites.length + config.benchmarkSuites.length === 0) {
				throw new Error('No test suites to run');
			}

			const suite = this._rootSuite;
			suite.grep = config.grep;
			suite.timeout = config.defaultTimeout;
			suite.bail = config.bail;
		});
	}

	protected _resolveConfig() {
		return super._resolveConfig().then(() => {
			const config = this.config;

			if (config.reporters.length === 0) {
				config.reporters = ['simple'];
			}

			return Promise.all(['suites', 'benchmarkSuites'].map(property => {
				return expandFiles(config[property]).then(expanded => {
					config[property] = expanded;
				});
			// return void
			})).then(() => null);
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
				// `lib/Server.js`
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

export { Config, Events };
