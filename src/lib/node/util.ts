import { getErrorMessage as _getErrorMessage, hasFunctionName } from '../util';
import { InternError } from '../../common';
import * as lang from 'dojo/lang';
import * as fs from 'fs';
import pathUtil = require('path');
import { hook, Instrumenter } from 'istanbul';
import { SourceMapConsumer, MappingItem } from 'source-map';

export * from '../util';

let instrumentationSourceMap: { [path: string]: SourceMapConsumer } = {};
let fileSourceMaps: { [path: string]: SourceMapConsumer } = {};
let fileSources: { [path: string]: string } = {};
let instrumenters: { [name: string]: Instrumenter } = {};

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

/**
 * Generates a full error message from a plain Error object, avoiding duplicate error messages that might be
 * caused by different opinions on what a stack trace should look like.
 *
 * @param error An object describing the error.
 * @returns A string message describing the error.
 */
export function getErrorMessage(error: string|Error|InternError): string {
	return _getErrorMessage(error, getSource);
}

/**
 * Instrument a given file, saving its coverage source map.
 *
 * @param filedata Text of file being instrumented
 * @param filepath Full path of file being instrumented
 * @param instrumenterOptions Extra options for the instrumenter
 *
 * @returns {string} A string of instrumented code
 */
export function instrument(filedata: string, filepath: string, instrumenterOptions?: any) {
	const instrumenter = getInstrumenter(instrumenterOptions);
	let options = (<any> instrumenter).opts;

	// Assign to options.codeGenerationOptions to handle the case where codeGenerationOptions is null
	options.codeGenerationOptions = lang.mixin(options.codeGenerationOptions, {
		sourceMap: pathUtil.normalize(filepath),
		sourceMapWithCode: true
	});

	const code = instrumenter.instrumentSync(filedata, pathUtil.normalize(filepath));
	const map = (<any> instrumenter).lastSourceMap();

	if (map) {
		instrumentationSourceMap[filepath] = loadSourceMap(map.toString());
		fileSources[filepath] = filedata;
	}

	return code;
}

/**
 * Normalize a path (e.g., resolve '..')
 */
export function normalizePath(path: string) {
	if (pathUtil) {
		return pathUtil.normalize(path).replace(/\\/g, '/');
	}

	const parts = path.replace(/\\/g, '/').split('/');
	let result: string[] = [];
	for (let i = 0; i < parts.length; ++i) {
		let part = parts[i];

		if (!part || part === '.') {
			if (i === 0 || i === parts.length - 1) {
				result.push('');
			}

			continue;
		}

		if (part === '..') {
			if (result.length && result[result.length - 1] !== '..') {
				result.pop();
			}
			else {
				result.push(part);
			}
		}
		else {
			result.push(part);
		}
	}

	return result.join('/');
}

// /**
//  * Resolve a module ID that contains a glob expression.
//  */
// export function resolveModuleIds(moduleIds: string[]): string[] {
// 	function moduleIdToPath(moduleId: string, pkg: string, packageLocation: string) {
// 		return packageLocation + moduleId.slice(pkg.length);
// 	}

// 	function pathToModuleId(path: string, pkg: string, packageLocation: string) {
// 		return pkg + path.slice(packageLocation.length, path.length - 3);
// 	}

// 	if (!moduleIds) {
// 		return moduleIds;
// 	}

// 	// The module ID has a glob character
// 	return moduleIds.reduce(function (resolved, moduleId) {
// 		if (isGlobModuleId(moduleId)) {
// 			const pkg = moduleId.slice(0, moduleId.indexOf('/'));
// 			const packageLocation = require.toUrl(pkg);
// 			let modulePath = moduleIdToPath(moduleId, pkg, packageLocation);

// 			// Ensure only JS files are considered
// 			if (!/\.js$/.test(modulePath)) {
// 				modulePath += '.js';
// 			}

// 			glob.sync(modulePath).forEach(function (file) {
// 				resolved.push(pathToModuleId(file, pkg, packageLocation));
// 			});
// 		}
// 		// The module ID is an actual ID
// 		else {
// 			resolved.push(moduleId);
// 		}

// 		return resolved;
// 	}, []);
// }

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
 * Adds hooks for code coverage instrumentation in the Node.js loader.
 *
 * @param excludeInstrumentation A RegExp or boolean used to decide whether to apply
 * instrumentation
 * @param basePath The base path for all code
 * @param instrumenterOptions Extra options for the instrumenter
 */
export function setInstrumentationHooks(excludeInstrumentation: (RegExp|boolean), basePath: string, instrumenterOptions: any) {
	basePath = normalizePath(pathUtil.resolve(basePath || '') + pathUtil.sep);

	function hookMatcher(filename: string) {
		filename = normalizePath(filename);

		return !excludeInstrumentation || (
			filename.indexOf(basePath) === 0 &&
			// if the string passed to `excludeInstrumentation` changes here, it must also change in
			// `lib/Proxy.js`
			!(<RegExp> excludeInstrumentation).test(filename.slice(basePath.length))
		);
	}

	function hookTransformer(code: string, filename: string) {
		return instrument(code, pathUtil.resolve(filename), instrumenterOptions);
	}

	const anyHook: any = hook;
	anyHook.hookRunInThisContext(hookMatcher, hookTransformer);
	anyHook.hookRequire(hookMatcher, hookTransformer);

	return {
		remove: function (this: any) {
			this.remove = function () {};
			anyHook.unhookRunInThisContext();
			anyHook.unhookRequire();
		}
	};
}

/**
 * Return the instrumenter, creating it if necessary.
 */
function getInstrumenter(instrumenterOptions: any) {
	instrumenterOptions = instrumenterOptions || {};

	const coverageVariable = instrumenterOptions.coverageVariable;

	if (!instrumenters[coverageVariable]) {
		const options = lang.mixin({
			// coverage variable is changed primarily to avoid any jshint complaints, but also to make
			// it clearer where the global is coming from
			coverageVariable: coverageVariable,

			// compacting code makes it harder to look at but it does not really matter
			noCompact: true,

			// auto-wrap breaks code
			noAutoWrap: true
		}, instrumenterOptions);

		instrumenters[coverageVariable] = new Instrumenter(options);
	}
	return instrumenters[coverageVariable];
}

/**
 * Get the original position of line:column based on map.
 *
 * Assumes mappings are is in order by generatedLine, then by generatedColumn; maps created with
 * SourceMapConsumer.eachMapping should be in this order by default.
 */
function getOriginalPosition(map: any, line: number, column: number): { line: number, column: number, source?: string } {
	let originalPosition = map.originalPositionFor({ line: line, column: column});

	// if the SourceMapConsumer was able to find a location, return it
	if (originalPosition.line !== null) {
		return originalPosition;
	}

	const entries: MappingItem[] = [];

	// find all map entries that apply to the given line in the generated output
	map.eachMapping(function (entry: MappingItem) {
		if (entry.generatedLine === line) {
			entries.push(entry);
		}
	}, null, map.GENERATED_ORDER);

	if (entries.length === 0) {
		// no valid mappings exist -- return the line and column arguments
		return { line: line, column: column };
	}

	originalPosition = entries[0];

	// Chrome/Node.js column is at the start of the term that generated the exception
	// IE column is at the beginning of the expression/line with the exceptional term
	// Safari column number is just after the exceptional term
	//   - need to go back one element in the mapping
	// Firefox, PhantomJS have no column number
	//   - for no col number, find the largest original line number for the generated line

	if (column !== null) {
		// find the most likely mapping for the given generated line and column
		let entry: MappingItem;
		for (let i = 1; i < entries.length; i++) {
			entry = entries[i];
			if (column > originalPosition.generatedColumn && column >= entry.generatedColumn) {
				originalPosition = entry;
			}
		}
	}

	return {
		line: originalPosition.originalLine,
		column: originalPosition.originalColumn,
		source: originalPosition.source
	};
}

/**
 * Dereference the source from a traceline.
 */
function getSource(tracepath: string) {
	/* jshint maxcomplexity:13 */
	let match: RegExpMatchArray;
	let source: string;
	let line: number;
	let col: number;
	let map: SourceMapConsumer;
	let originalPos: { source?: string, line: number, column: number };
	let result: string;

	if (tracepath === '<anonymous>') {
		return 'anonymous';
	}

	if (!(match = /^(.*?):(\d+)(:\d+)?$/.exec(tracepath))) {
		// no line or column data
		return tracepath;
	}

	tracepath = match[1];
	line = Number(match[2]);
	col = match[3] ? Number(match[3].substring(1)) : null;

	// strip the host when we have a URL

	if ((match = /^\w+:\/\/[^\/]+\/(.*)$/.exec(tracepath))) {
		// resolve the URL path to a filesystem path
		tracepath = pathUtil ? pathUtil.resolve(match[1]) : match[1];
	}

	source = pathUtil.relative('.', tracepath);

	// first, check for an instrumentation source map
	if (tracepath in instrumentationSourceMap) {
		map = instrumentationSourceMap[tracepath];
		originalPos = getOriginalPosition(map, line, col);
		line = originalPos.line;
		col = originalPos.column;
		if (originalPos.source) {
			source = originalPos.source;
		}
	}

	// next, check for original source map
	if ((map = getSourceMap(tracepath))) {
		originalPos = getOriginalPosition(map, line, col);
		line = originalPos.line;
		col = originalPos.column;
		if (originalPos.source) {
			source = pathUtil.join(pathUtil.dirname(source), originalPos.source);
		}
	}

	result = source + ':' + line;
	if (col !== null) {
		result += ':' + col;
	}
	return result;
}

/**
 * Load and process the source map for a given file.
 */
function getSourceMap(filepath: string) {
	let data: string;
	let lines: string[];
	let lastLine: string;
	let match: RegExpMatchArray;
	const sourceMapRegEx = /(?:\/{2}[#@]{1,2}|\/\*)\s+sourceMappingURL\s*=\s*(data:(?:[^;]+;)+base64,)?(\S+)/;

	if (filepath in fileSourceMaps) {
		return fileSourceMaps[filepath];
	}

	try {
		if (filepath in fileSources) {
			data = fileSources[filepath];
		}
		else {
			data = fs.readFileSync(filepath).toString('utf-8');
			fileSources[filepath] = data;
		}

		lines = data.trim().split('\n');
		lastLine = lines[lines.length - 1];

		if ((match = sourceMapRegEx.exec(lastLine))) {
			if (match[1]) {
				data = JSON.parse((new Buffer(match[2], 'base64').toString('utf8')));
				fileSourceMaps[filepath] = loadSourceMap(data);
			}
			else {
				// treat map file path as relative to the source file
				const mapFile = pathUtil.join(pathUtil.dirname(filepath), match[2]);
				data = fs.readFileSync(mapFile, { encoding: 'utf8' });
				fileSourceMaps[filepath] = loadSourceMap(data);
			}
			return fileSourceMaps[filepath];
		}
	}
	catch (error) {
		// this is normal for files like node.js -- just return null
		return null;
	}
}

/**
 * Return a new SourceMapConsumer for a given source map string.
 */
function loadSourceMap(data: any) {
	return new SourceMapConsumer(data);
}
