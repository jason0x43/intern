import { Formatter as BaseFormatter } from './format';
import * as fs from 'fs';
import pathUtil = require('path');
import { Instrumenter } from 'istanbul';
import { MappingItem, RawSourceMap, SourceMapConsumer } from 'source-map';
import { mixin } from 'dojo-core/lang';

let instrumentationSourceMap: { [path: string]: SourceMapConsumer } = {};
let fileSourceMaps: { [path: string]: SourceMapConsumer } = {};
let fileSources: { [path: string]: string } = {};
let instrumenters: { [name: string]: Instrumenter } = {};

export class Formatter extends BaseFormatter {
	/**
	 * Dereference the source from a traceline.
	 */
	protected _getSource(tracepath: string) {
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
	let options = instrumenter.opts;
	if (!options.codeGenerationOptions) {
		options.codeGenerationOptions = {};
	}

	// Assign to options.codeGenerationOptions to handle the case where codeGenerationOptions is null
	options.codeGenerationOptions = mixin(options.codeGenerationOptions, {
		sourceMap: pathUtil.normalize(filepath),
		sourceMapWithCode: true
	});

	const code = instrumenter.instrumentSync(filedata, pathUtil.normalize(filepath));
	const map = (<any>instrumenter).lastSourceMap();

	if (map) {
		instrumentationSourceMap[filepath] = new SourceMapConsumer(map.toString());
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

/**
 * Return the instrumenter, creating it if necessary.
 */
function getInstrumenter(instrumenterOptions: any) {
	instrumenterOptions = instrumenterOptions || {};

	const coverageVariable = instrumenterOptions.coverageVariable;

	if (!instrumenters[coverageVariable]) {
		const options = mixin({
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
	let originalPosition = map.originalPositionFor({ line: line, column: column });

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
 * Load and process the source map for a given file.
 */
function getSourceMap(filepath: string) {
	let data: string;
	let rawMap: RawSourceMap;
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
				rawMap = JSON.parse((new Buffer(match[2], 'base64').toString('utf8')));
				fileSourceMaps[filepath] = new SourceMapConsumer(rawMap);
			}
			else {
				// treat map file path as relative to the source file
				const mapFile = pathUtil.join(pathUtil.dirname(filepath), match[2]);
				rawMap = JSON.parse(fs.readFileSync(mapFile, { encoding: 'utf8' }));
				fileSourceMaps[filepath] = new SourceMapConsumer(rawMap);
			}
			return fileSourceMaps[filepath];
		}
	}
	catch (error) {
		// this is normal for files like node.js -- just return null
		return null;
	}
}
