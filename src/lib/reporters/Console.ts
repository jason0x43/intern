import { getErrorMessage } from '../node/util';
import Executor from '../executors/Executor';
import Suite from '../Suite';
import Test from '../Test';
import Reporter, { ReporterConfig } from './Reporter';

/**
 * The console reporter outputs to the current environment's console.
 */
export default class ConsoleReporter extends Reporter {
	console: Console;
	hasGrouping: boolean;
	testId: string;

	constructor(config: ReporterConfig = {}, executor: Executor) {
		super(config, executor);
		this.console = this.config.console;
		this.hasGrouping = 'group' in this.console && 'groupEnd' in this.console;
		this.testId = this.hasGrouping ? 'name' : 'id';
	}

	fatalError(error: Error): void {
		this.console.warn('FATAL ERROR');
		this.console.error(getErrorMessage(error));
	}

	reporterError(_reporter: Reporter, error: Error): void {
		this.console.error('REPORTER ERROR');
		this.console.error(getErrorMessage(error));
	}

	suiteEnd(suite: Suite): void {
		// IE<10 does not provide a global console object when Developer Tools is turned off
		if (!this.console) {
			return;
		}

		const numTests = suite.numTests;
		const numFailedTests = suite.numFailedTests;
		const numSkippedTests = suite.numSkippedTests;
		let message = numFailedTests + '/' + numTests + ' tests failed';

		if (numSkippedTests > 0) {
			message += ' (' + numSkippedTests + ' skipped)';
		}

		this.console[numFailedTests ? 'warn' : 'info'](message);
		this.hasGrouping && this.console.groupEnd();
	}

	suiteError(suite: Suite): void {
		if (!this.console) {
			return;
		}
		this.console.warn('SUITE ERROR');
		this.console.error(getErrorMessage(suite.error));
	}

	suiteStart(suite: Suite): void {
		// only start group for non-root suite
		this.hasGrouping && suite.hasParent && this.console.group(suite.name);
	}

	testFail(test: Test): void {
		this.console.error('FAIL: ' + (<{ [key: string]: any }> test)[this.testId] + ' (' + test.timeElapsed + 'ms)');
		this.console.error(getErrorMessage(test.error));
	}

	testPass(test: Test): void {
		this.console.log('PASS: ' + (<{ [key: string]: any }> test)[this.testId] + ' (' + test.timeElapsed + 'ms)');
	}

	testSkip(test: Test): void {
		this.console.log('SKIP: ' + (<{ [key: string]: any }> test)[this.testId] + (test.skipped ? ' (' + test.skipped + ')' : ''));
	}
}
