import { getErrorMessage } from '../node/util';
import Suite from '../Suite';
import Test from '../Test';
import Collector = require('istanbul/lib/collector');
import TextReporter = require('istanbul/lib/report/text');
import Reporter, { ReporterConfig } from './Reporter';

/**
 * The console reporter outputs to the current environment's console.
 */
export default class Simple extends Reporter {
	console: Console;
	testId: string;
	protected _coverageReporter: TextReporter;

	constructor(config: ReporterConfig = {}) {
		super(config);
		this.console = config.console;
		this.testId = 'id';
		this._coverageReporter = new TextReporter({
			watermarks: config.watermarks
		});
	}

	error(error: Error): void {
		this.console.error('FATAL ERROR');
		this.console.error(getErrorMessage(error));
	}

	suiteEnd(suite: Suite): void {
		if (suite.error) {
			this.console.warn('SUITE ERROR');
			this.console.error(getErrorMessage(suite.error));
		}
		else {
			const numTests = suite.numTests;
			const numFailedTests = suite.numFailedTests;
			const numSkippedTests = suite.numSkippedTests;
			let message = numFailedTests + '/' + numTests + ' tests failed';

			if (numSkippedTests > 0) {
				message += ' (' + numSkippedTests + ' skipped)';
			}

			this.console[numFailedTests ? 'warn' : 'info'](message);
		}
	}

	testEnd(test: Test): void {
		if (test.error) {
			this.console.error('FAIL: ' + (<{ [key: string]: any }> test)[this.testId] + ' (' + test.timeElapsed + 'ms)');
			this.console.error(getErrorMessage(test.error));
		}
		else if (test.skipped) {
			this.console.log('SKIP: ' + (<{ [key: string]: any }> test)[this.testId] + (test.skipped ? ' (' + test.skipped + ')' : ''));
		}
		else {
			this.console.log('PASS: ' + (<{ [key: string]: any }> test)[this.testId] + ' (' + test.timeElapsed + 'ms)');
		}
	}

	coverage(coverage: Object): void {
		const collector = new Collector();
		collector.add(coverage);

		// add a newline between test results and coverage results for prettier output
		this.console.log('');
		this._coverageReporter.writeReport(collector, true);
	}
}
