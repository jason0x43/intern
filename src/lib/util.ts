import * as intern from '../main';
import * as diffUtil from 'diff';
import { Deferred, InternError } from '../common';
import Promise = require('dojo/Promise');

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
 * Create a Deferred with some additional utility methods.
 */
export function createDeferred(): Deferred<any> {
	let dfd = new Promise.Deferred(function (reason) {
		throw reason;
	});

	/**
	 * Wraps any callback to resolve the deferred so long as the callback executes without throwing any Errors.
	 */
	let dfdAny: any = dfd;
	dfdAny.callback = function (this: Deferred<any>, callback: Function): any {
		return this.rejectOnError((...args: any[]) => {
			const returnValue = callback.apply(this, args);
			this.resolve();
			return returnValue;
		});
	};

	/**
	 * Wraps a callback to reject the deferred if the callback throws an Error.
	 */
	dfdAny.rejectOnError = function (this: Deferred<any>, callback: Function): any {
		return (...args: any[]) => {
			try {
				return callback.apply(this, args);
			}
			catch (error) {
				this.reject(error);
			}
		};
	};

	return <Deferred<any>> dfd;
}

export function defineLazyProperty(object: Object, property: string, getter: () => any) {
	Object.defineProperty(object, property, {
		get: function (this: any) {
			const value = getter.apply(this, arguments);
			Object.defineProperty(object, property, {
				value: value,
				configurable: true,
				enumerable: true
			});
			return value;
		},
		configurable: true,
		enumerable: true
	});
}

export interface Queuer {
	(callee: Function): () => void;
	empty?: () => void;
}

/**
 * Creates a basic FIFO function queue to limit the number of currently executing asynchronous functions.
 *
 * @param maxConcurrency Number of functions to execute at once.
 * @returns A function that can be used to push new functions onto the queue.
 */
export function createQueue(maxConcurrency: number) {
	let numCalls = 0;
	let queue: any[] = [];

	function shiftQueue() {
		if (queue.length) {
			const callee = queue.shift();
			Promise.resolve(callee[0].apply(callee[1], callee[2])).finally(shiftQueue);
		}
		else {
			--numCalls;
		}
	}

	// Returns a function to wrap callback function in this queue
	let queuer: Queuer = function (callee: Function) {
		// Calling the wrapped function either executes immediately if possible,
		// or pushes onto the queue if not
		return function (this: any) {
			if (numCalls < maxConcurrency) {
				++numCalls;
				Promise.resolve(callee.apply(this, arguments)).finally(shiftQueue);
			}
			else {
				queue.push([ callee, this, arguments ]);
			}
		};
	};

	(<any> queuer).empty = function () {
		queue = [];
		numCalls = 0;
	};

	return queuer;
}

/**
 * Escape special characters in a regexp string
 */
export function escapeRegExp(str: any) {
	return String(str).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

export function getShouldWait(waitMode: (string|boolean), message: string|any[]) {
	let shouldWait = false;
	let eventName = message[0];

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
 * Run an async callback until it resolves, up to numRetries times
 */
export function retry(callback: Function, numRetries: number) {
	let numAttempts = 0;
	return callback().catch(function retry(error: Error) {
		if (error.name !== 'CancelError' && ++numAttempts <= numRetries) {
			return callback().catch(retry);
		}
		else {
			throw error;
		}
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
 * Return a trace line in a standardized format.
 */
function formatLine(data: { func?: string, source: string }, getSource: (name: string) => string) {
	if (!data.func) {
		return '  at <' + getSource(data.source) + '>';
	}
	return '  at ' + data.func + '  <' + getSource(data.source) + '>';
}

/**
 * Generates a full error message from a plain Error object, avoiding duplicate error messages that might be
 * caused by different opinions on what a stack trace should look like.
 *
 * @param error An object describing the error.
 * @returns A string message describing the error.
 */
export function getErrorMessage(error: string|Error|InternError, getSource: (name: string) => string): string {
	/* jshint maxcomplexity:14 */
	if (typeof error !== 'string' && (error.message || error.stack)) {
		let message = (error.name || 'Error') + ': ' + (error.message || 'Unknown error');
		let stack = error.stack;

		if (stack) {
			// V8 puts the original error at the top of the stack too; avoid redundant output that may
			// cause confusion about how many times an assertion was actually called
			if (stack.indexOf(message) === 0) {
				stack = stack.slice(message.length);
			}
			else if (stack.indexOf(error.message) === 0) {
				stack = stack.slice(String(error.message).length);
			}

			const filterStack = intern && intern.config && intern.config.filterErrorStack;
			stack = normalizeStackTrace(stack, filterStack, getSource);
		}

		const anyError: any = error;

		if (anyError.showDiff && typeof anyError.actual === 'object' && typeof anyError.expected === 'object') {
			const diff = createDiff(anyError.actual, anyError.expected);
			if (diff) {
				message += '\n\n' + diff + '\n';
			}
		}

		if (stack && /\S/.test(stack)) {
			message += stack;
		}
		else if (anyError.fileName) {
			message += '\n  at ' + anyError.fileName;
			if (anyError.lineNumber != null) {
				message += ':' + anyError.lineNumber;

				if (anyError.columnNumber != null) {
					message += ':' + anyError.columnNumber;
				}
			}

			message += '\nNo stack';
		}
		else {
			message += '\nNo stack or location';
		}

		return message;
	}
	else {
		return String(error);
	}
}

/**
 * Parse a stack trace, apply any source mappings, and normalize its format.
 */
function normalizeStackTrace(stack: string, filterStack: boolean, getSource: (name: string) => string) {
	let lines = stack.replace(/\s+$/, '').split('\n');
	let firstLine = '';

	if (/^(?:[A-Z]\w+)?Error: /.test(lines[0])) {
		// ignore the first line if it's just the Error name
		firstLine = lines[0] + '\n';
		lines = lines.slice(1);
	}

	// strip leading blank lines
	while (/^\s*$/.test(lines[0])) {
		lines = lines.slice(1);
	}

	let stackLines = /^\s*at /.test(lines[0]) ? processChromeTrace(lines, getSource) : processSafariTrace(lines, getSource);

	if (filterStack) {
		stackLines = stackLines.filter(function (line) {
			return !(
				/internal\/process\//.test(line) ||
				/browser_modules\//.test(line) ||
				/node_modules\//.test(line)
			);
		});
	}

	return '\n' + firstLine + stackLines.join('\n');
}

/**
 * Process Chrome, Opera, and IE traces.
 */
function processChromeTrace(lines: string[], getSource: (name: string) => string) {
	return lines.map(function (line) {
		let match: RegExpMatchArray;
		if ((match = /^\s*at (.+?) \(([^)]+)\)$/.exec(line))) {
			return formatLine({ func: match[1], source: match[2] }, getSource);
		}
		else if ((match = /^\s*at (.*)/.exec(line))) {
			return formatLine({ source: match[1] }, getSource);
		}
		else {
			return line;
		}
	});
}

/**
 * Process Safari and Firefox traces.
 */
function processSafariTrace(lines: string[], getSource: (name: string) => string) {
	return lines.map(function (line) {
		let match: RegExpMatchArray;
		if ((match = /^([^@]+)@(.*)/.exec(line))) {
			return formatLine({ func: match[1], source: match[2] }, getSource);
		}
		else if ((match = /^(\w+:\/\/.*)/.exec(line))) {
			return formatLine({ source: match[1] }, getSource);
		}
		else {
			return line;
		}
	});
}

