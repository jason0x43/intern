import * as diffUtil from 'diff';

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
 * Indicate whether Proxy or WebDriver should wait for an event to process
 * before continuing.
 */
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
