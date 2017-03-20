import request from 'dojo-core/request/xhr';
import Task from 'dojo-core/async/Task';
import { deepMixin } from 'dojo-core/lang';
import { parseArgs } from '../util';

/**
 * Given a script suffix, return the base path
 */
export function getBasePath(suffix: string) {
	const host = /https?:\/\/[^\/]+(?:\/)/.exec(document.baseURI)[0];
	const currentScript = <HTMLScriptElement>document.currentScript || (function() {
		const scripts = document.getElementsByTagName('script');
		return scripts[scripts.length - 1];
	})();
	const scriptPath = `/${currentScript.src.slice(host.length)}`;
	if (suffix[0] !== '/') {
		suffix = `/${suffix}`;
	}

	if (scriptPath.indexOf(suffix) !== scriptPath.length - suffix.length) {
		throw new Error(`Current script doesn't end with suffix '${suffix}': ${scriptPath}`);
	}

	return `${scriptPath.slice(0, scriptPath.length - suffix.length)}/`;
}

/**
 * Get the user-supplied config data, which may include query args and a config file.
 */
export function getConfig() {
	const args = parseArgs(parseQuery());
	const basePath = args.basePath || '/';

	if (args.config) {
		// If a config parameter was provided, load it, mix in any other query params, then initialize the executor with
		// that
		let configPath = args.config;
		if (configPath[0] !== '/') {
			configPath = `${basePath}${args.config}`;
		}
		return loadJson(configPath).then(config => deepMixin(config, args));
	}
	else {
		// If no config parameter was provided, try 'intern.json'. If that file doesn't exist, just return the args
		return loadJson(`${basePath}intern.json`).then(
			config => deepMixin(config, args),
			_error => args
		);
	}
}

/**
 * Load suites and start Intern
 */
export function loadAndRun(config: { [key: string]: any }) {
	intern.log('Intern base path:', intern.config.internBasePath);
	let loaderTask: Task<any>;

	if (config.loader) {
		let loader = <string>config.loader;
		switch (loader) {
			case 'dojo':
			case 'dojo2':
				loader = `${intern.config.internBasePath}/browser/loader/${loader}.js`;
				break;
		}
		intern.log('Using loader script', loader);
		loaderTask = intern.loadScript(loader);
	}
	else {
		loaderTask = intern.loadScript(config.suites);
	}

	return loaderTask.then(() => intern.run());
}

/**
 * Load a JSON resource
 */
export function loadJson(path: string): Task<any> {
	return request(path).then(response => {
		return JSON.parse(<string>response.data);
	});
}

/**
 * Normalize a path (e.g., resolve '..')
 */
export function normalizePath(path: string) {
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
 * Parse a query string and return a set of decoded name=value pairs
 */
export function parseQuery(query?: string) {
	query = query || location.search.slice(1);
	return query.split('&').filter(arg => {
		return arg !== '' && arg[0] !== '=';
	}).map(arg => {
		const parts = arg.split('=');
		const name = decodeURIComponent(parts[0]);
		if (parts[1]) {
			return `${name}=${decodeURIComponent(parts[1])}`;
		}
		return name;
	});
}
