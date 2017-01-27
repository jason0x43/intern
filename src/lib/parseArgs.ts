import { CommandLineArguments } from '../common';

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
