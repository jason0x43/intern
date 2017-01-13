import Formatter from '../Formatter';
import { mixin } from 'dojo-core/lang';
import Executor from '../executors/Executor';
import { Config } from '../../common';

export interface ReporterProperties {
	console: Console;
	output: ReporterOutput;
	formatter: Formatter;
}

export type ReporterOptions = Partial<ReporterProperties>;

export interface ReporterOutput {
	write(chunk: string | Buffer, encoding?: string, callback?: Function): void;
	end(chunk: string | Buffer, encoding?: string, callback?: Function): void;
}

export default class Reporter implements ReporterProperties {
	console: Console;

	executor: Executor;

	protected _defaultFormatter: Formatter;

	protected _output: ReporterOutput;

	constructor(config: ReporterOptions = {}) {
		mixin(this, config);

		if (!this.console) {
			this.console = getConsole();
		}
	}

	get formatter() {
		if (this.executor) {
			return this.executor.formatter;
		}
		if (!this._defaultFormatter) {
			this._defaultFormatter = new Formatter();
		}
		return this._defaultFormatter;
	}

	get internConfig(): Config {
		return this.executor.config;
	}

	get output() {
		if (!this._output) {
			const _console = this.console;
			this._output = {
				write(chunk: string, _encoding: string, callback: Function) {
					_console.log(chunk);
					callback();
				},
				end(chunk: string, _encoding: string, callback: Function) {
					_console.log(chunk);
					callback();
				}
			};
		}
		return this._output;
	}

	set output(value: ReporterOutput) {
		this._output = value;
	}
}

function getConsole() {
	if (typeof console !== 'undefined') {
		return console;
	}

	return <Console> {
		assert: noop,
		count: noop,
		dir: noop,
		error: noop,
		exception: noop,
		info: noop,
		log: noop,
		table: noop,
		time: noop,
		timeEnd: noop,
		trace: noop,
		warn: noop
	};
}

function noop() {
	// do nothing
}
