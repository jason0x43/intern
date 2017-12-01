import request from '@dojo/core/request/providers/xhr';
import Task from '@dojo/core/async/Task';
import global from '@dojo/shim/global';

import { parseArgs } from '../common/config';

export function getArgs() {
	return parseArgs(parseQuery());
}

export function getConfigFile() {
	const args = getArgs();
	const basePath = args.basePath || getDefaultBasePath();
	return args.config || resolvePath('intern.json', basePath);
}

/**
 * Return a base path based on the current location pathname
 */
export function getDefaultBasePath() {
	const match = /^(.*\/)node_modules\/intern\/?/.exec(
		global.location.pathname
	);
	if (match) {
		// If the current location contains `node_modules/intern`,
		// assume the base path is the parent of
		// `node_modules/intern`
		return match[1];
	} else {
		return '/';
	}
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
			} else {
				result.push(part);
			}
		} else {
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
	return query
		.split('&')
		.filter(arg => {
			return arg !== '' && arg[0] !== '=';
		})
		.map(arg => {
			const parts = arg.split('=');
			const name = decodeURIComponent(parts[0]);
			if (parts[1]) {
				return `${name}=${decodeURIComponent(parts[1])}`;
			} else if (parts.length > 1) {
				return `${name}=`;
			}
			return name;
		});
}

/**
 * Parse a URL
 */
export type Url = {
	protocol: string;
	hostname: string;
	port: string;
	path: string;
	query: string;
	hash: string;
};

export function parseUrl(url: string): Url | undefined {
	if (url) {
		const match = /^(([^:\/?#]+):)?(\/\/(([^:\/?#]*)(:(\d+))?))?([^?#]*)(\?([^#]*))?(#(.*))?/.exec(
			url
		);
		if (match) {
			return {
				protocol: match[2],
				hostname: match[5],
				port: match[7],
				path: match[8],
				query: match[10],
				hash: match[12]
			};
		}
	}
}

/**
 * Load a text resource
 */
export function loadText(path: string): Task<any> {
	return request(path).then(response => {
		if (!response.ok) {
			throw new Error('Request failed: ' + response.status);
		}
		return response.text();
	});
}

/**
 * Resolve a path against a base path
 */
function resolvePath(path: string, basePath: string) {
	if (path[0] === '/') {
		return path;
	}

	const pathParts = path.split('/');
	const basePathParts = basePath.split('/');

	if (basePathParts[basePathParts.length - 1] === '') {
		basePathParts.pop();
	}

	for (const part of pathParts) {
		if (part === '..') {
			basePathParts.pop();
		} else if (part !== '.') {
			basePathParts.push(part);
		}
	}

	return basePathParts.join('/');
}
