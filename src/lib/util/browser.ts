import { getErrorMessage as _getErrorMessage } from '../util';
import { InternError } from '../../common';
export * from '../util';

export function getErrorMessage(error: string|Error|InternError): string {
	return _getErrorMessage(error, getSource);
}

function getSource(tracepath: string) {
	/* jshint maxcomplexity:13 */
	let match: RegExpMatchArray;
	let line: number;
	let col: number;

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

	// no further processing in browser environments
	return tracepath + ':' + line + (col == null ? '' : ':' + col);
}
