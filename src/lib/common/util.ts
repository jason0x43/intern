import { Message } from '../Channel';
import diffUtil = require('diff');

export const hasFunctionName = function () {
	function foo() {}
	return (<any> foo).name === 'foo';
}();

/**
 * Creates a unified diff to explain the difference between two objects.
 *
 * @param actual The actual result.
 * @param expected The expected result.
 * @returns A unified diff formatted string representing the difference between the two objects.
 */
export function createDiff(actual: Object, expected: Object): string {
	actual = serialize(actual);
	expected = serialize(expected);

	let diff = diffUtil
		.createPatch('', actual + '\n', expected + '\n', '', '')
		// diff header, first range information section, and EOF newline are not relevant for serialised object
		// diffs
		.split('\n')
		.slice(5, -1)
		.join('\n')
		// range information is not relevant for serialised object diffs
		.replace(/^@@[^@]*@@$/gm, '[...]');

	// If the diff is empty now, running the next replacement will cause it to have some extra whitespace, which
	// makes it harder than it needs to be for callers to know if the diff is empty
	if (diff) {
		// + and - are not super clear about which lines are the expected object and which lines are the actual
		// object, and bump directly into code with no indentation, so replace the characters and add space
		diff = diff.replace(/^([+-]?)(.*)$/gm, function (_, indicator, line) {
			if (line === '[...]') {
				return line;
			}

			return (indicator === '+' ? 'E' : indicator === '-' ? 'A' : '') + ' ' + line;
		});
	}

	return diff;
}

/**
 * Indicate whether Server or WebDriver should wait for an event to process before continuing.
 */
export function getShouldWait(waitMode: (string|boolean), message: Message) {
	let shouldWait = false;
	let eventName = message.name;

	if (waitMode === 'fail') {
		if (
			eventName === 'testFail' ||
			eventName === 'suiteError' ||
			eventName === 'fatalError'
		) {
			shouldWait = true;
		}
	}
	else if (waitMode === true) {
		shouldWait = true;
	}
	else if (Array.isArray(waitMode) && waitMode.indexOf(eventName) !== -1) {
		shouldWait = true;
	}

	return shouldWait;
}

/**
 * Normalize a path such that it ends in '/'
 */
export function normalizePath(path: string) {
	if (path && path.length > 0 && path[path.length - 1] !== '/') {
		return `${path}/`;
	}
	return path;
}

/**
 * Parse an array of name=value arguments into an object
 */
export function parseArgs(rawArgs: string[]) {
	const args: { [key: string]: any } = {};
	rawArgs.forEach(arg => {
		let [name, value] = arg.split('=', 2);

		if (typeof value === 'undefined') {
			args[name] = true;
		}
		else {
			try {
				// Always try to convert string args
				if (typeof value === 'string') {
					value = JSON.parse(value);
				}
			}
			catch (_error) {
				// ignore
			}

			if (!(name in args)) {
				args[name] = value;
			}
			else if (!Array.isArray(args[name])) {
				args[name] = [args[name], value];
			}
			else {
				args[name].push(value);
			}
		}
	});

	return args;
}

/**
 * Parse a JSON string that may contain comments
 */
export function parseJSON(json: string) {
	return JSON.parse(removeComments(json));
}

export function parseValue(name: string, value: any, parser: TypeName) {
	if (typeof parser === 'string') {
		switch (parser) {
			case 'boolean':
				if (typeof value === 'boolean') {
					return value;
				}
				if (value === 'true') {
					return true;
				}
				if (value === 'false') {
					return false;
				}
				throw new Error(`Non-boolean value "${value}" for ${name}`);

			case 'number':
				const numValue = Number(value);
				if (!isNaN(numValue)) {
					return numValue;
				}
				throw new Error(`Non-numeric value "${value}" for ${name}`);

			case 'regexp':
				if (typeof value === 'string') {
					return new RegExp(value);
				}
				if (value instanceof RegExp) {
					return value;
				}
				throw new Error(`Non-regexp value "${value}" for ${name}`);

			case 'object':
				if (typeof value === 'string') {
					try {
						return JSON.parse(value);
					}
					catch (error) {
						throw new Error(`Non-object value "${value}" for ${name}`);
					}
				}
				if (typeof value === 'object') {
					return value;
				}
				throw new Error(`Non-object value "${value}" for ${name}`);

			case 'string':
				if (typeof value === 'string') {
					return value;
				}
				throw new Error(`Non-string value "${value}" for ${name}`);

			case 'string[]':
				if (typeof value === 'string') {
					return [value];
				}
				if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
					return value;
				}
				throw new Error(`Non-string[] value "${value}" for ${name}`);

			case 'object|string':
				if (typeof value === 'string') {
					if (value[0] === '{') {
						try {
							return JSON.parse(value);
						}
						catch (error) {
							throw new Error(`Invalid object string "${value}" for ${name}`);
						}
					}
					return value;
				}
				if (typeof value === 'object') {
					return value;
				}
				throw new Error(`Non-string|object value "${value}" for ${name}`);
		}
	}
	else if (typeof parser === 'function') {
		return parser(value);
	}
	else {
		throw new Error('Parser must be a type name or a function');
	}
}

export type TypeName = 'string' | 'boolean' | 'number' | 'regexp' | 'object' | 'string[]' | 'object|string';

/**
 * Remove all instances of of an item from any array and return the removed instances.
 */
export function pullFromArray<T>(haystack: T[], needle: T): T[] {
	let removed: T[] = [];
	let i = 0;

	while ((i = haystack.indexOf(needle, i)) > -1) {
		removed.push(haystack.splice(i, 1)[0]);
	}

	return removed;
}

/**
 * Run an async callback until it resolves, up to numRetries times
 */
export function retry<T>(callback: () => Promise<T>, numRetries: number) {
	let numAttempts = 0;
	return callback().catch(function retry(error: Error): Promise<T> {
		if (error.name !== 'CancelError' && ++numAttempts <= numRetries) {
			return callback().catch(retry);
		}
		throw error;
	});
}

/**
 * Creates a serialised representation of an object.
 *
 * @param object The object to serialise.
 * @returns A canonical, serialised representation of the object.
 */
export function serialize(object: Object): string {
	let indent = '';
	let output = '';
	let stack: any[] = [];

	function writeDate(value: Date) {
		output += value.toISOString();
	}

	function writeObject(object: any) {
		// jshint maxcomplexity:12

		if (stack.indexOf(object) > -1) {
			output += '[Circular]';
			return;
		}

		const isArray = Array.isArray(object);
		const isFunction = typeof object === 'function';

		if (isArray) {
			output += '[';
		}
		else if (isFunction) {
			output += (hasFunctionName ? (object.name || '<anonymous>') : '<function>') + '({';
		}
		else {
			output += '{';
		}

		const keys = Object.keys(object);

		if (keys.length || isArray) {
			stack.push(object);
			indent += '  ';

			keys.sort(function (a, b) {
				const na = Number(a);
				const nb = Number(b);

				// Sort numeric keys to the top, in numeric order, to display arrays in their natural sort order
				if (!isNaN(na) && !isNaN(nb)) {
					return na - nb;
				}

				if (!isNaN(na) && isNaN(nb)) {
					return -1;
				}

				if (isNaN(na) && !isNaN(nb)) {
					return 1;
				}

				if (a < b) {
					return -1;
				}

				if (a > b) {
					return 1;
				}

				return 0;
			}).forEach(function (key, index) {
				output += (index > 0 ? ',' : '') + '\n' + indent;
				isArray && !isNaN(Number(key)) ? writePrimitive(key) : writeString(key);
				output += ': ';
				write(object[key]);
			});

			if (isArray) {
				output += (keys.length ? ',' : '') + '\n' + indent;
				writePrimitive('length');
				output += ': ';
				write(object.length);
			}

			output += '\n';
			indent = indent.slice(0, -2);
			stack.pop();

			output += indent;
		}

		if (isArray) {
			output += ']';
		}
		else if (isFunction) {
			output += '})';
		}
		else {
			output += '}';
		}
	}

	function writePrimitive(value: any) {
		output += String(value);
	}

	function writeString(value: string) {
		output += JSON.stringify(value);
	}

	function write(value: any) {
		switch (typeof value) {
		case 'object':
		case 'function':
			if (value === null) {
				writePrimitive(value);
			}
			else if (value instanceof Date) {
				writeDate(value);
			}
			else if (value instanceof RegExp) {
				writePrimitive(value);
			}
			else {
				writeObject(value);
			}
			break;
		case 'string':
			writeString(value);
			break;
		default:
			writePrimitive(value);
			break;
		}
	}

	write(object);
	return output;
}

/**
 * Remove JS-style line and block comments from a string
 */
function removeComments(text: string) {
	let state: 'string' | 'block-comment' | 'line-comment' | 'default' = 'default';
	let i = 0;

	// Create an array of chars from the text, the blank out anything in a comment
	const chars = text.split('');

	while (i < chars.length) {
		switch (state) {
			case 'block-comment':
				if (chars[i] === '*' && chars[i + 1] === '/') {
					chars[i] = ' ';
					chars[i + 1] = ' ';
					state = 'default';
					i += 2;
				}
				else if (chars[i] !== '\n') {
					chars[i] = ' ';
					i += 1;
				}
				else {
					i += 1;
				}
				break;

			case 'line-comment':
				if (chars[i] === '\n') {
					state = 'default';
				}
				else {
					chars[i] = ' ';
				}
				i += 1;
				break;

			case 'string':
				if (chars[i] === '"') {
					state = 'default';
					i += 1;
				}
				else if (chars[i] === '\\' && chars[i + 1] === '\\') {
					i += 2;
				}
				else if (chars[i] === '\\' && chars[i + 1] === '"') {
					i += 2;
				}
				else {
					i += 1;
				}
				break;

			default:
				if (chars[i] === '"') {
					state = 'string';
					i += 1;
				}
				else if (chars[i] === '/' && chars[i + 1] === '*') {
					chars[i] = ' ';
					chars[i + 1] = ' ';
					state = 'block-comment';
					i += 2;
				}
				else if (chars[i] === '/' && chars[i + 1] === '/') {
					chars[i] = ' ';
					chars[i + 1] = ' ';
					state = 'line-comment';
					i += 2;
				}
				else {
					i += 1;
				}
		}
	}

	return chars.join('');
}
