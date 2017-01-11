export interface ReporterConfig {
	console?: any; // Console
	watermarks?: any; // Watermarks;
	filename?: string;
	output?: ReporterOutput;
	projectRoot?: string;
	directory?: string;
}

export interface ReporterOutput {
	write(chunk: string | Buffer, encoding?: string, callback?: Function): void;
	end(chunk: string | Buffer, encoding?: string, callback?: Function): void;
}

export default class Reporter {
	config: ReporterConfig;

	constructor(config: ReporterConfig = {}) {
		this.config = config;

		if (!config.console) {
			this.config.console = getConsole();
		}
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
