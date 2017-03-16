import { normalize } from 'path';
import { readFile } from 'fs';
import Task from 'dojo-core/async/Task';
import { runInThisContext } from 'vm';

/**
 * Loads a text resource.
 *
 * @param resource a path to a text resource
 */
export function loadText(resource: string): Task<string>;
export function loadText(resource: string[]): Task<string[]>;
export function loadText(resource: string | string[]): Task<string> | Task<string[]>;
export function loadText(resource: string | string[]): Task<string> | Task<string[]> {
	if (resource == null) {
		return <Task<any>>Task.resolve();
	}

	if (Array.isArray(resource)) {
		return Task.all(resource.map((resource: string) => {
			return loadSingleText(resource);
		}));
	}

	return loadSingleText(resource);
}

/**
 * Load a script or scripts using Node's require.
 *
 * @param script a path to a script
 */
export function loadScript(script: string | string[]) {
	if (script == null) {
		return Task.resolve();
	}

	if (Array.isArray(script)) {
		return loadText(script).then(texts => {
			texts.forEach(text => runInThisContext(text, { filename: script[0] }));
		});
	}

	return loadText(script).then((text: string) => {
		runInThisContext(text, { filename: script });
	});
}

/**
 * Normalize a path (e.g., resolve '..')
 */
export function normalizePath(path: string) {
	return normalize(path).replace(/\\/g, '/');
}

function loadSingleText(path: string) {
	return new Task<string>((resolve, reject) => {
		readFile(path, { encoding: 'utf8' }, (error, data) => {
			if (error) {
				reject(error);
			}
			else {
				resolve(data);
			}
		});
	});
}
