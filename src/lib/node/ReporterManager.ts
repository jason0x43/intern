import BaseReporterManager, { ReporterConfig, ReporterConstructor } from '../ReporterManager';
import * as lang from 'dojo/lang';
import { watermarks } from 'istanbul/lib/report/common/defaults';
import { defineLazyProperty } from '../util';

import { createWriteStream, mkdirSync, statSync } from 'fs';
import { dirname, join, sep } from 'path';

export default class ReporterManager extends BaseReporterManager {
	/**
	 * Add a reporter to the list of managed reporters.
	 */
	add(Reporter: (ReporterConstructor | Object), config?: ReporterConfig) {
		// https://github.com/gotwarlost/istanbul/issues/358
		if ('watermarks' in config) {
			config.watermarks = lang.mixin(watermarks(), config.watermarks);
		}

		if (config.filename) {
			if (dirname(config.filename) !== '.') {
				mkdir(dirname(config.filename));
			}

			// Lazily create the writable stream so we do not open an extra fd for reporters that use
			// `filename` directly and never touch `config.output`
			defineLazyProperty(config, 'output', function () {
				return createWriteStream(config.filename);
			});
		}
		else {
			// See theintern/intern#454; all \r must be replaced by \x1b[1G (cursor move to column 1)
			// on Windows due to a libuv bug
			let write: (data: string) => any;
			if (process.platform === 'win32') {
				write = function (data) {
					let args: (any[] | IArguments);
					if (typeof data === 'string' && data.indexOf('\r') !== -1) {
						data = data.replace(/\r/g, '\x1b[1G');
						args = [data].concat(Array.prototype.slice.call(arguments, 1));
					}
					else {
						args = arguments;
					}

					return process.stdout.write.apply(process.stdout, args);
				};
			}
			else {
				write = process.stdout.write.bind(process.stdout);
			}

			config.output = lang.delegate(process.stdout, {
				write: write,
				// Allow reporters to call `end` regardless of whether or not they are outputting to file,
				// without an error for stdout (which cannot be closed)
				end: write
			});
		}

		return super.add(Reporter, config);
	}
}

function isDirectory(pathname: string) {
	try {
		return statSync(pathname).isDirectory();
	}
	catch (error) {
		return false;
	}
}

function mkdir(dirname: string) {
	dirname.split(sep).reduce(function (currentPath, part) {
		currentPath = join(currentPath, part);
		if (!isDirectory(currentPath)) {
			mkdirSync(currentPath);
		}
		return currentPath;
	}, '');
}
