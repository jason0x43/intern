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

	output: ReporterOutput;

	executor: Executor;

	protected _defaultFormatter: Formatter;

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
