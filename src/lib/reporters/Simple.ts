import Suite from '../Suite';
import Test from '../Test';
import Coverage from './Coverage';
import { CoverageMessage } from '../executors/Executor';

/**
 * The console reporter outputs to the current environment's console.
 */
export default class Simple extends Coverage {
	console: Console;

	error(error: Error): void {
		this.console.error('FATAL ERROR');
		this.console.error(this.formatter.format(error));
	}

	suiteEnd(suite: Suite): void {
		if (suite.error) {
			this.console.warn('SUITE ERROR');
			this.console.error(this.formatter.format(suite.error));
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
			this.console.error(`FAIL: ${test.id} (${test.timeElapsed}ms)`);
			this.console.error(this.formatter.format(test.error));
		}
		else if (test.skipped) {
			this.console.log(`SKIP: ${test.id} (${test.skipped})`);
		}
		else {
			this.console.log(`PASS: ${test.id} (${test.timeElapsed}ms)`);
		}
	}

	coverage(data: CoverageMessage): void {
		this.collector.add(data.coverage);

		// add a newline between test results and coverage results for prettier output
		this.console.log('');
		this.report.writeReport(this.collector, true);
	}
}
