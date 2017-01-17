import Suite from '../Suite';
import Test from '../Test';
import Reporter, { ReporterOptions, ReporterOutput } from './Reporter';

/**
 * The console reporter outputs to the browser console.
 */
export default class ConsoleReporter extends Reporter {
	hasGrouping: boolean;
	testId: keyof Test;

	constructor(options: ReporterOptions = {}) {
		super(options);
		this.hasGrouping = 'group' in this.console && 'groupEnd' in this.console;
		this.testId = this.hasGrouping ? 'name' : 'id';
	}

	get output(): ReporterOutput {
		if (!this._output) {
			const element = document.createElement('pre');
			this._output = {
				write(chunk: string, _encoding: string, callback: Function) {
					element.appendChild(document.createTextNode(chunk));
					callback();
				},
				end(chunk: string, _encoding: string, callback: Function) {
					element.appendChild(document.createTextNode(chunk));
					document.body.appendChild(element);
					callback();
				}
			};
		}
		return this._output;
	}

	error(error: Error): void {
		this.console.warn('FATAL ERROR');
		this.console.error(this.formatter.format(error));
	}

	suiteEnd(suite: Suite): void {
		// IE<10 does not provide a global console object when Developer Tools is turned off
		if (!this.console) {
			return;
		}

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

		this.hasGrouping && this.console.groupEnd();
	}

	suiteStart(suite: Suite): void {
		// only start group for non-root suite
		this.hasGrouping && suite.hasParent && this.console.group(suite.name);
	}

	testEnd(test: Test): void {
		if (test.error) {
			this.console.error(`FAIL: ${test[this.testId]} (${test.timeElapsed}ms)`);
			this.console.error(this.formatter.format(test.error));
		}
		else if (test.skipped) {
			this.console.log(`SKIP: ${test[this.testId]} (${test.skipped})`);
		}
		else {
			this.console.log(`PASS: ${test[this.testId]} (${test.timeElapsed})ms)`);
		}
	}
}
