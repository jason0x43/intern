/**
 * Handles presentation of runner results to the user
 */

import Executor from '../executors/Executor';
import Suite from '../Suite';
import Test from '../Test';
import Reporter, { createEventHandler, ReporterProperties } from './Reporter';
import { CoverageMessage, DeprecationMessage } from '../executors/Executor';
import { Events, TunnelMessage } from '../executors/WebDriver';
import { mixin } from 'dojo-core/lang';
import { format } from 'util';
import charm = require('charm');
import TextReport = require('istanbul/lib/report/text');
import Collector = require('istanbul/lib/collector');
import encode = require('charm/lib/encode');

const eventHandler = createEventHandler<Events>();

export interface PrettyProperties extends ReporterProperties {
	dimensions: any;
	titleWidth: number;
	maxProgressBarWidth: number;
	colorReplacement: { [key: string]: string };
}

export type PrettyOptions = Partial<PrettyProperties>;

export default class Pretty extends Reporter implements PrettyProperties {
	spinnerOffset: number;
	dimensions: any;
	titleWidth: number;
	maxProgressBarWidth: number;
	colorReplacement: { [key: string]: string };
	reporters: any;
	log: string[];

	// TODO: Where should watermarks come from?
	watermarks: any;

	tunnelState: string;
	header: string;

	private _total: Report;

	private _charm: charm.Charm;

	private _renderTimeout: NodeJS.Timer;

	constructor(executor: Executor<Events>, config: PrettyOptions = {}) {
		super(executor, config);

		this.spinnerOffset = 0;
		this.dimensions = config.dimensions || {};
		this.titleWidth = config.titleWidth || 12;
		this.maxProgressBarWidth = config.maxProgressBarWidth || 40;
		this.colorReplacement = mixin({
			0: ANSI_COLOR.green + '✓',
			1: ANSI_COLOR.reset + '~',
			2: ANSI_COLOR.red + '×',
			'✓': ANSI_COLOR.green,
			'!': ANSI_COLOR.red,
			'×': ANSI_COLOR.red,
			'~': ANSI_COLOR.reset,
			'⚠': ANSI_COLOR.yellow
		}, config.colorReplacement);
		this.header = '';
		this.reporters = {};
		this.log = [];
		this.tunnelState = '';
		this._renderTimeout = undefined;
		this._total = new Report();
	}

	@eventHandler()
	runStart() {
		this.header = this.executor.config.name;
		this._charm = this._charm || this._newCharm();

		const resize = () => {
			this.dimensions.width = (<any> process.stdout).columns || 80;
			this.dimensions.height = (<any> process.stdout).rows || 24;
		};

		resize();
		process.stdout.on('resize', resize);

		const rerender = () => {
			this._charm.erase('screen').position(0, 0);
			this._render();
			this._renderTimeout = setTimeout(rerender, 200);
		};
		rerender();
	}

	@eventHandler()
	runEnd() {
		const charm = this._charm;
		clearTimeout(this._renderTimeout);
		charm.erase('screen').position(0, 0);

		// write a full log of errors
		// Sort logs: pass < deprecated < skip < errors < fail
		const ERROR_LOG_WEIGHT = { '!': 4, '×': 3, '~': 2, '⚠': 1, '✓': 0 };
		const logs = this.log.sort((a: any, b: any) => {
			a = (<{ [key: string]: any }> ERROR_LOG_WEIGHT)[a.charAt(0)] || 0;
			b = (<{ [key: string]: any }> ERROR_LOG_WEIGHT)[b.charAt(0)] || 0;
			return a - b;
		}).map(line => this._getColor(line) + line).join('\n');
		charm.write(logs);
		charm.write('\n\n');

		// Display the pretty results
		this._render(true);

		// Display coverage information
		if (this._total.coverage.files().length > 0) {
			charm.write('\n');
			(new TextReport({
				watermarks: this.watermarks
			})).writeReport(this._total.coverage, true);
		}
	}

	@eventHandler()
	coverage(data: CoverageMessage) {
		const reporter = this.reporters[data.sessionId];
		reporter && reporter.coverage.add(data.coverage);
		this._total.coverage.add(data.coverage);
	}

	@eventHandler()
	suiteStart(suite: Suite) {
		if (!suite.hasParent) {
			const numTests = suite.numTests;
			this._total.numTotal += numTests;

			if (suite.sessionId) {
				this._getReporter(suite).numTotal += numTests;
			}
		}
	}

	@eventHandler()
	suiteEnd(suite: Suite) {
		if (suite.error) {
			this._record(suite.sessionId, FAIL);

			const message = '! ' + suite.id;
			this.log.push(message + '\n' + this.formatter.format(suite.error));
		}
	}

	@eventHandler()
	testEnd(test: Test) {
		if (test.skipped) {
			this._record(test.sessionId, SKIP);
			this.log.push('~ ' + test.id + ': ' + (test.skipped || 'skipped'));
		}
		else if (test.error) {
			const message = '× ' + test.id;
			this._record(test.sessionId, FAIL);
			this.log.push(message + '\n' + this.formatter.format(test.error));
		}
		else {
			this._record(test.sessionId, PASS);
			this.log.push('✓ ' + test.id);
		}
	}

	@eventHandler()
	tunnelDownloadProgress(message: TunnelMessage) {
		const progress = message.progress;
		this.tunnelState = 'Downloading ' + (progress.received / progress.numTotal * 100).toFixed(2) + '%';
	}

	@eventHandler()
	tunnelStatus(message: TunnelMessage) {
		this.tunnelState = message.status;
	}

	@eventHandler()
	error(error: Error) {
		const message = '! ' + error.message;
		this.log.push(message + '\n' + this.formatter.format(error));
		// stop the render timeout on a fatal error so Intern can exit
		clearTimeout(this._renderTimeout);
	}

	@eventHandler()
	deprecated(message: DeprecationMessage) {
		let text = '⚠ ' + message.original + ' is deprecated.';

		if (message.replacement) {
			text += ' Use ' + message.replacement + ' instead.';
		}

		if (message.message) {
			text += ' ' + message.message;
		}

		this.log.push(text);
	}

	/**
	 * Return the reporter for a given session, creating it if necessary.
	 */
	private _getReporter(suite: Suite): Report {
		if (!this.reporters[suite.sessionId]) {
			this.reporters[suite.sessionId] = new Report(suite.remote && suite.remote.environmentType.toString());
		}
		return this.reporters[suite.sessionId];
	}

	/**
	 * Create the charm instance used by this reporter.
	 */
	private _newCharm(): charm.Charm {
		const c = charm();
		c.pipe(process.stdout);
		return c;
	}

	private _record(sessionId: string, result: number) {
		const reporter = this.reporters[sessionId];
		reporter && reporter.record(result);
		this._total.record(result);
	}

	/**
	 * Render the progress bar
	 * [✔︎~✔︎×✔︎✔︎✔︎✔︎✔︎✔︎] 99/100
	 * @param report the report data to render
	 * @param width the maximum width for the entire progress bar
	 */
	private _drawProgressBar(report: Report, width: number) {
		const spinnerCharacter = SPINNER_STATES[this.spinnerOffset];
		const charm = this._charm;
		if (!report.numTotal) {
			charm.write('Pending');
			return;
		}

		const totalTextSize = String(report.numTotal).length;
		const remainingWidth = Math.max(width - 4 - (totalTextSize * 2), 1);
		const barSize = Math.min(remainingWidth, report.numTotal, this.maxProgressBarWidth);
		const results = report.getCompressedResults(barSize);

		charm.write('[' + results.map(value => this._getColor(value)).join(''));
		charm.display('reset').write(fit(spinnerCharacter, barSize - results.length) + '] ' +
			fit(report.finished, totalTextSize, true) + '/' + report.numTotal);
	}

	/**
	 * Render a single line
	 * TITLE:        [✔︎~✔︎×✔︎✔︎✔︎✔︎✔︎✔︎] 100/100, 2 fail, 1 skip
	 * TODO split this into two lines. The first line will display the
	 * title, OS and code coverage and the progress bar on the second
	 */
	private _drawSessionReporter(report: Report) {
		const charm = this._charm;
		const titleWidth = this.titleWidth;
		const leftOfBar = fit(this._abbreviateEnvironment(report.environment).slice(0, titleWidth - 2) + ': ',
			titleWidth);
		const rightOfBar = '' +
			(report.numFailed ? ', ' + report.numFailed + ' fail' : '') +
			(report.numSkipped ? ', ' + report.numSkipped + ' skip' : '');
		const barWidth = this.dimensions.width - rightOfBar.length - titleWidth;

		charm.write(leftOfBar);
		this._drawProgressBar(report, barWidth);
		charm.write(rightOfBar + '\n');
	}

	/**
	 * Abbreviate the environment information for rendering
	 * @param env the test environment
	 * @returns {string} abbreviated environment information
	 */
	private _abbreviateEnvironment(env: any): string {
		const browser = (<{ [key: string]: any }> BROWSERS)[env.browserName.toLowerCase()] || env.browserName.slice(0, 4);
		const result = [browser];

		if (env.version) {
			let version = String(env.version);
			if (version.indexOf('.') > -1) {
				version = version.slice(0, version.indexOf('.'));
			}
			result.push(version);
		}

		if (env.platform) {
			result.push(env.platform.slice(0, 3));
		}

		return result.join(' ');
	}

	private _render(omitLogs: boolean = false) {
		const charm = this._charm;
		const numReporters = Object.keys(this.reporters).length;
		const logLength = this.dimensions.height - numReporters - 4 /* last line & total */ -
			(this.tunnelState ? 2 : 0) - (numReporters ? 1 : 0) - (this.header ? 1 : 0);
		this.spinnerOffset = (++this.spinnerOffset) % SPINNER_STATES.length;

		charm.display('reset');
		if (this.header) {
			charm.display('bright');
			charm.write(this.header + '\n');
			charm.display('reset');
		}
		this.tunnelState && charm.write('Tunnel: ' + this.tunnelState + '\n\n');
		this._drawTotalReporter(this._total);

		// TODO if there is not room to render all reporters only render
		// active ones or only the total with less space
		if (numReporters) {
			charm.write('\n');
			for (let key in this.reporters) {
				this._drawSessionReporter(this.reporters[key]);
			}
		}

		if (!omitLogs && logLength > 0 && this.log.length) {
			const allowed = { '×': true, '⚠': true, '!': true };
			const logs = this.log.filter(line => {
				return (<{ [key: string]: any }> allowed)[line.charAt(0)];
			}).slice(-logLength).map(line => {
				// truncate long lines
				const color = this._getColor(line);
				line = line.split('\n', 1)[0];
				return color + line.slice(0, this.dimensions.width) + ANSI_COLOR.reset;
			}).join('\n');
			charm.write('\n');
			charm.write(logs);
		}
	}

	private _drawTotalReporter(report: Report) {
		const charm = this._charm;
		const title = 'Total: ';
		const totalTextSize = String(report.numTotal).length;

		charm.write(title);
		this._drawProgressBar(report, this.dimensions.width - title.length);
		charm.write(format('\nPassed: %s  Failed: %s  Skipped: %d\n',
			fit(report.numPassed, totalTextSize), fit(report.numFailed, totalTextSize), report.numSkipped));
	}

	private _getColor(value: string | number): string {
		if (typeof value === 'string') {
			value = value[0];
		}
		return this.colorReplacement[value] || ANSI_COLOR.reset;
	}
}

/**
 * Model tracking test results
 * @param environment the environment associated with the report
 * @param sessionId the sessionId associated with the report
 */
class Report {
	environment: string;
	sessionId: string;
	numTotal: number = 0;
	numPassed: number = 0;
	numFailed: number = 0;
	numSkipped: number = 0;
	results: number[] = [];
	coverage: Collector = new Collector();

	constructor(environment?: string, sessionId?: string) {
		this.environment = environment;
		this.sessionId = sessionId;
	}

	get finished() {
		return this.results.length;
	}

	record(result: number) {
		this.results.push(result);
		switch (result) {
		case PASS:
			++this.numPassed;
			break;
		case SKIP:
			++this.numSkipped;
			break;
		case FAIL:
			++this.numFailed;
			break;
		}
	}

	getCompressedResults(maxWidth: number): number[] {
		const total = Math.max(this.numTotal, this.results.length);
		const width = Math.min(maxWidth, total);
		const resultList: number[] = [];

		for (let i = 0; i < this.results.length; ++i) {
			const pos = Math.floor(i / total * width);
			resultList[pos] = Math.max(resultList[pos] || PASS, this.results[i]);
		}

		return resultList;
	}
}

const PAD = new Array(100).join(' ');
const SPINNER_STATES = [ '/', '-', '\\', '|' ];
const PASS = 0;
const SKIP = 1;
const FAIL = 2;
const BROWSERS = {
	chrome: 'Chr',
	firefox: 'Fx',
	opera: 'O',
	safari: 'Saf',
	'internet explorer': 'IE',
	phantomjs: 'Phan'
};

const ANSI_COLOR = {
	red: encode('[31m').toString('utf8'),
	green: encode('[32m').toString('utf8'),
	yellow: encode('[33m').toString('utf8'),
	reset: encode('[0m').toString('utf8')
};

function pad(width: number): string {
	return PAD.slice(0, Math.max(width, 0));
}

function fit(text: string|number, width: number, padLeft: boolean = false): string {
	text = String(text);
	if (text.length < width) {
		if (padLeft) {
			return pad(width - text.length) + text;
		}
		return text + pad(width - text.length);
	}
	return text.slice(0, width);
}

