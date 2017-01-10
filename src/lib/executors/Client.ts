import { Config } from '../../common';
import ReporterManager from '../node/ReporterManager';
import Executor from './Executor';
import Suite from '../Suite';

// AMD modules
import * as has from 'dojo/has';
import * as lang from 'dojo/lang';

/**
 * The Client executor is used to run unit tests in the local environment.
 *
 * @constructor module:intern/lib/executors/Client
 * @extends module:intern/lib/executors/Executor
 */
export default class Client extends Executor {
	mode: 'client';

	constructor(config: Config) {
		config = lang.deepMixin({
			reporters: ['Console']
		}, config);

		super(config);

		this.suites = [new Suite({})];
		this.reporterManager = new ReporterManager();

		if (has('host-browser')) {
			this.config.reporters.push('Html');
		}
	}

	_afterRun() {
		return super._afterRun.apply(this, arguments).finally(() => {
			this.reporterManager.empty();
		});
	}

	_beforeRun() {
		const suite = this.suites[0];
		suite.name = this.config.rootSuiteName || null;
		suite.grep = this.config.grep;
		suite.sessionId = this.config.sessionId;
		suite.timeout = this.config.defaultTimeout;
		suite.reporterManager = this.reporterManager;
		suite.bail = this.config.bail;

		return super._beforeRun.apply(this, arguments);
	}
}
