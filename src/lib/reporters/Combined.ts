/* jshint node:true */
import * as intern from '../../main';
import { getErrorMessage } from '../node/util';
import * as fs from 'fs';
import Suite from '../Suite';
import Test from '../Test';
import Tunnel from 'digdug/Tunnel';
import { Reporter, ReporterConfig, ReporterOutput, Remote } from '../../common';
import Collector = require('istanbul/lib/collector');
import JsonReporter = require('istanbul/lib/report/json');
import LcovHtmlReporter = require('istanbul/lib/report/html');
import TextReporter = require('istanbul/lib/report/text');
import Report = require('istanbul/lib/report');

export default class Combined implements Reporter {
	private _collector: Collector;
	private _hasDot: boolean;
	private _reporters: Report[];
	output: ReporterOutput;

	constructor(config: ReporterConfig = {}) {
		this._collector = new Collector();
		this.output = config.output;
		this._hasDot = false;

		if (intern.mode === 'client') {
			this._reporters = [
				new JsonReporter()
			];
		}
		else {
			this._reporters = [
				new TextReporter({ watermarks: config.watermarks }),
				new LcovHtmlReporter({ dir: config.directory, watermarks: config.watermarks })
			];
		}
	}

	private _writeLine() {
		if (this._hasDot) {
			this.output.write('\n');
			this._hasDot = false;
		}
	}

	coverage(_sessionId: string, coverage: Object): void {
		this._collector.add(coverage);
	}

	deprecated(deprecated: string, replacement: string, extra: string): void {
		this.output.write(`⚠  ${deprecated}  is deprecated.`);
		if (replacement) {
			this.output.write(` Use ${replacement} instead.`);
		}
		if (extra) {
			this.output.write(extra);
		}
		this.output.write('\n');
	}

	fatalError(error: Error): void {
		this._writeLine();
		this.output.write(getErrorMessage(error) + '\n');
	}

	run(): void {
		this.output.write(`Running ${intern.mode} tests...\n`);
	}

	runEnd(): void {
		const collector = this._collector;

		if (intern.mode === 'runner' && fs.existsSync('coverage-final.json')) {
			collector.add(JSON.parse(fs.readFileSync('coverage-final.json').toString()));
		}

		this._writeLine();
		this._reporters.forEach(function (reporter) {
			reporter.writeReport(collector, true);
		});
	}

	sessionStart(remote: Remote) {
		this._writeLine();
		this.output.write(`Testing ${remote.environmentType}\n`);
	}

	suiteError(_suite: Suite, error: Error): void {
		this._writeLine();
		this.output.write(getErrorMessage(error) + '\n');
	}

	tunnelDownloadProgress(_tunnel: Tunnel, progress: { loaded: number, total: number }): void {
		const total = progress.loaded / progress.total;

		if (isNaN(total)) {
			return;
		}

		this.output.write('\rDownload ' + (total * 100).toFixed(2) + '% complete');

		if (total === 1) {
			this.output.write('\n');
		}
	}

	tunnelStart(): void {
		this._writeLine();
		this.output.write('\r\x1b[KTunnel started\n');
	}

	tunnelStatus(_tunnel: Tunnel, status: string): void {
		this.output.write(`\r\x1b[KTunnel:${status}`);
	}

	testFail(test: Test): void {
		this._writeLine();
		this.output.write(`FAIL: ${test.id}\n`);
		this.output.write(getErrorMessage(test.error) + '\n');
	}

	testPass(): void {
		if (intern.mode === 'runner') {
			this.output.write('.');
			this._hasDot = true;
		}
	}

}
