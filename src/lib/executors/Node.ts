import { Config } from '../../common';
import Simple from '../reporters/Simple';
import Executor from './Executor';
import Suite from '../Suite';
import { setInstrumentationHooks } from '../node/util';
import Promise = require('dojo/Promise');

/**
 * The Node executor is used to run unit tests in a Node environment.
 */
export default class Node extends Executor {
	mode: 'client';

	constructor(config: Config) {
		super(config);
		this._rootSuites = [new Suite({
			executor: this
		})];

		if (this._reporters.length === 0) {
			this.addReporter(new Simple());
		}
	}

	protected _beforeRun() {
		return super._beforeRun().then(() => {
			const suite = this._rootSuites[0];
			suite.name = this.config.rootSuiteName || null;
			suite.grep = this.config.grep;
			suite.sessionId = this.config.sessionId;
			suite.timeout = this.config.defaultTimeout;
			suite.bail = this.config.bail;

			const config = this.config;
			if (config.excludeInstrumentation !== true) {
				return Promise.resolve(this.enableInstrumentation(
					config.basePath,
					(<RegExp>config.excludeInstrumentation),
					config.instrumenterOptions
				));
			}
		});
	}

	enableInstrumentation(basePath: string, excludePaths: RegExp, instrumenterOptions: { [key: string]: string }) {
		return setInstrumentationHooks(excludePaths, basePath, instrumenterOptions);
	}
}
