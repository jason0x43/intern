import { CommandLineArguments, Config } from '../common';
// import { BenchmarkMode, CommandLineArguments, Config } from '../common';
import { deepMixin } from 'dojo-core/lang';

export function parseCommandLine(rawArgs: string[]) {
	return parseArguments(rawArgs || process.argv.slice(2));
};

export function parseQueryString(query: string) {
	return parseArguments(query.replace(/^\?/, '').split('&'), function (str) {
		// Boolean properties should not be coerced into strings, but will be if they are passed to
		// decodeURIComponent
		if (typeof str === 'boolean') {
			return str;
		}

		return decodeURIComponent(str);
	});
};

export function mixIntoConfig(config: Config, args?: CommandLineArguments) {
	args = args || {};

	config = deepMixin(config, args);

	if (args['grep']) {
		let grep = /^\/(.*)\/([gim]*)$/.exec(args['grep']);

		if (grep) {
			config.grep = new RegExp(grep[1], grep[2]);
		}
		else {
			config.grep = new RegExp(args['grep'], 'i');
		}
	}

	// if (config.grep == null) {
	// 	config.grep = new RegExp('');
	// }

	// TODO: don't set defaults here
	// if (config.proxyPort == null) {
	// 	config.proxyPort = 9000;
	// }
	// else if (typeof config.proxyPort === 'string') {
	if (typeof config.proxyPort === 'string') {
		if (isNaN(config.proxyPort)) {
			throw new Error('proxyPort must be a number');
		}
		config.proxyPort = Number(config.proxyPort);
	}

	// If the user doesn't specify a proxy URL, construct one using the proxy port.
	if (config.proxyUrl == null) {
		config.proxyUrl = 'http://localhost:' + config.proxyPort + '/';
	}

	// let benchmarkConfig = config.benchmarkConfig = lang.deepMixin({
	// 	id: 'Benchmark',
	// 	filename: 'baseline.json',
	// 	mode: <BenchmarkMode>'test',
	// 	thresholds: {
	// 		warn: { rme: 3, mean: 5 },
	// 		fail: { rme: 6, mean: 10 }
	// 	},
	// 	verbosity: 0
	// }, config.benchmarkConfig);

	// if (config.benchmark) {
	// 	if (config.baseline) {
	// 		benchmarkConfig.mode = 'baseline';
	// 	}

	// 	config.suites = config.benchmarkSuites || [];
	// 	config.functionalSuites = [];
	// 	config.excludeInstrumentation = true;
	// }

	return config;
}

function parseArguments(rawArgs: string[], decoder?: (name: string) => any) {
	let args: CommandLineArguments = {};
	rawArgs.forEach(function (arg) {
		const parts = arg.split('=');

		const key: string = parts[0].replace(/^--?/, '');
		let value: any;

		// Support boolean flags
		if (parts.length < 2) {
			value = true;
		}
		else {
			if (decoder) {
				value = decoder(value);
			}

			// Support JSON-encoded properties for reporter configuration
			if (value.charAt(0) === '{') {
				value = JSON.parse(value);
			}
			else if (value.slice(0, 2) === '\\{') {
				value = value.slice(1);
			}
		}

		// Support multiple arguments with the same name
		if (key in args) {
			if (!Array.isArray(args[key])) {
				args[key] = [args[key]];
			}

			args[key].push(value);
		}
		else {
			args[key] = value;
		}
	});

	return args;
}
