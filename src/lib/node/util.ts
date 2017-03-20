import { normalize, relative, resolve } from 'path';
import { readFile } from 'fs';
import { parseArgs } from '../util';
import { deepMixin } from 'dojo-core/lang';
import Task from 'dojo-core/async/Task';

/**
 * Get the user-supplied config data, which may include query args and a config file.
 */
export function getConfig(): Task<any> {
	const args = parseArgs(process.argv.slice(2));

	if (args.config) {
		// If a config parameter was provided, load it and mix in any other command line args.
		return loadJson(args.config).then(config => {
			return deepMixin(config, args);
		});
	}

	else {
		// If no config parameter was provided, try 'intern.json', or just resolve to the original args
		try {
			return loadJson('intern.json').then(config => {
				return deepMixin(config, args);
			});
		}
		catch (error) {
			return Task.resolve(args);
		}
	}
}

/**
 * Loads a text resource.
 *
 * @param resource a path to a text resource
 */
export function loadJson(resource: string): Task<string> {
	return new Task<string>((resolve, reject) => {
		readFile(resource, { encoding: 'utf8' }, (error, data) => {
			if (error) {
				reject(error);
			}
			else {
				resolve(JSON.parse(data));
			}
		});
	});
}

/**
 * Load a script or scripts using Node's require.
 *
 * @param script a path to a script
 */
export function loadScript(script: string | string[]) {
	if (Array.isArray(script)) {
		script.forEach(script => {
			require(relative(__dirname, resolve(script)));
		});
	}
	else if (script != null) {
		require(relative(__dirname, resolve(script)));
	}

	return Task.resolve();
}

/**
 * Normalize a path (e.g., resolve '..')
 */
export function normalizePath(path: string) {
	return normalize(path).replace(/\\/g, '/');
}

/**
 * Require a module relative to the project root (cwd)
 */
export function projectRequire(mod: string) {
	require(resolve(mod));
}
