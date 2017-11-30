import { deepMixin } from '@dojo/core/lang';
import Task from '@dojo/core/async/Task';

import { Config, Configurable, ResourceConfig } from '../executors/Executor';
import { getPathSep, join, normalize } from './path';

export interface EvaluatedProperty<C extends Config = Config> {
	name: keyof C;
	addToExisting: boolean;
}

export type TypeName =
	| 'string'
	| 'boolean'
	| 'number'
	| 'regexp'
	| 'object'
	| 'string[]'
	| 'object[]';

export type Parser<T = any> = (value: any) => T;

/**
 * Evaluate a config property key
 */
export function evalProperty<C extends Config>(
	key: string
): EvaluatedProperty<C> {
	const addToExisting = key[key.length - 1] === '+';
	const name = <keyof C>(addToExisting
		? <keyof C>key.slice(0, key.length - 1)
		: key);
	return { name, addToExisting };
}

/**
 * Get the base path based on a config file path and a user-supplied base path.
 *
 * The path separator will be normalized based on the separator used in
 * configFile or basePath and the optional pathSep arg.
 */
export function getBasePath(
	configFile: string,
	basePath: string,
	isAbsolute: (path: string) => boolean,
	pathSep?: string
) {
	pathSep = pathSep || getPathSep(configFile, basePath);

	// initialBasePath is the path containing the config file
	const configPathParts = configFile.replace(/\\/g, '/').split('/');
	let initialBasePath: string;

	if (configFile[0] === '/' && configPathParts.length === 2) {
		initialBasePath = '/';
	} else {
		initialBasePath = configPathParts.slice(0, -1).join('/');
	}

	let finalBasePath: string;

	if (basePath) {
		basePath = normalize(basePath);

		if (isAbsolute(basePath)) {
			// basePath is absolute, so use it directly
			finalBasePath = basePath;
		} else {
			// basePath is relative, so resolve it against initialBasePath
			finalBasePath = join(initialBasePath, basePath);
		}
	} else {
		// No basePath was provided, so use initialBasePath
		finalBasePath = initialBasePath;
	}

	return finalBasePath.split('/').join(pathSep);
}

/**
 * Return a string describing a config file, including any child configs.
 */
export function getConfigDescription(config: any, prefix = '') {
	let description = '';

	if (config.description) {
		description += `${prefix}${config.description}\n\n`;
	}

	if (config.configs) {
		description += `${prefix}Configs:\n`;
		const width = Object.keys(config.configs).reduce((width, name) => {
			return Math.max(width, name.length);
		}, 0);
		const lines = Object.keys(config.configs).map(name => {
			const child = config.configs[name];
			while (name.length < width) {
				name += ' ';
			}
			let line = `  ${name}`;
			if (child.description) {
				line += ` (${child.description})`;
			}
			return `${prefix}${line}`;
		});

		description += lines.join('\n');
	}

	return description;
}

/**
 * Load config data from a given path, using a given text loader, and mixing
 * args and/or a childConfig into the final config value if provided.
 */
export function loadConfig(
	configPath: string,
	configurable: Configurable,
	childConfig?: string | string[]
): Task<any> {
	return configurable
		.loadText(configPath)
		.then(text => {
			const preConfig = parseJson(text);

			// extends paths are assumed to be relative and use '/'
			if (preConfig.extends) {
				const parts = configPath.split('/');
				const { configFile, childConfig } = splitConfigPath(
					preConfig.extends
				);
				const extensionPath = parts
					.slice(0, parts.length - 1)
					.concat(configFile)
					.join('/');

				return loadConfig(
					extensionPath,
					configurable,
					undefined,
					childConfig
				).then(extension => {
					// Process all keys except 'configs' from the config to the
					// thing it's extending
					Object.keys(preConfig)
						.filter(key => key !== 'configs')
						.forEach(key => {
							configurable.setOption(key, preConfig[key]);
						});

					// If config has a 'configs' property, mix its values into
					// extension.configs (slightly deeper mixin)
					if (preConfig.configs) {
						if (extension.configs == null) {
							extension.configs = {};
						}
						Object.keys(preConfig.configs).forEach(key => {
							extension.configs[key] = preConfig.configs[key];
						});
					}
					return extension;
				});
			} else {
				const config: any = {};
				Object.keys(preConfig).forEach(key => {
					configurable.setOption(key, preConfig[key]);
				});
				return config;
			}
		})
		.then(config => {
			if (childConfig) {
				const mixinConfig = (childConfig: string | string[]) => {
					const configs = Array.isArray(childConfig)
						? childConfig
						: [childConfig];
					configs.forEach(childConfig => {
						const child = config.configs[childConfig];
						if (!child) {
							throw new Error(
								`Unknown child config "${childConfig}"`
							);
						}
						if (child.extends) {
							mixinConfig(child.extends);
						}

						// Mix the child into the current config.
						Object.keys(child).forEach(key => {
							configurable.setOption(key, child[key]);
						});
					});
				};

				mixinConfig(childConfig);
			}
			return config;
		});
}

/**
 * Parse an array of name=value arguments into an object
 */
export function parseArgs(rawArgs: string[]) {
	const parsedArgs: { [key: string]: any } = {};

	for (const arg of rawArgs) {
		let name = arg;
		let value: string | undefined;
		let args = parsedArgs;

		const eq = arg.indexOf('=');
		if (eq !== -1) {
			name = arg.slice(0, eq);
			value = arg.slice(eq + 1);
		}

		if (name.indexOf('.') !== -1) {
			const parts = name.split('.');
			const head = parts.slice(0, parts.length - 1);
			name = parts[parts.length - 1];

			for (const part of head) {
				if (!args[part]) {
					args[part] = {};
				}
				args = args[part];
			}
		}

		if (typeof value === 'undefined') {
			args[name] = true;
		} else {
			if (!(name in args)) {
				args[name] = value;
			} else if (!Array.isArray(args[name])) {
				args[name] = [args[name], value];
			} else {
				args[name].push(value);
			}
		}
	}

	return parsedArgs;
}

/**
 * Parse a JSON string that may contain comments
 */
export function parseJson(json: string) {
	return JSON.parse(removeComments(json));
}

/**
 * Parse a particular type of value from a given value
 *
 * @param name The 'name' of the value being parsed (used for error messages)
 * @param value A value to parse something from
 * @param parser The type of thing to parse, or a parser function
 * @param requiredProperty Only used with 'object' and 'object[]' parsers
 */
export function parseValue(
	name: string,
	value: any,
	parser: TypeName | Parser,
	requiredProperty?: string
) {
	switch (parser) {
		case 'boolean':
			if (typeof value === 'boolean') {
				return value;
			}
			if (value === 'true') {
				return true;
			}
			if (value === 'false') {
				return false;
			}
			throw new Error(`Non-boolean value "${value}" for ${name}`);

		case 'number':
			const numValue = Number(value);
			if (!isNaN(numValue)) {
				return numValue;
			}
			throw new Error(`Non-numeric value "${value}" for ${name}`);

		case 'regexp':
			if (typeof value === 'string') {
				return new RegExp(value);
			}
			if (value instanceof RegExp) {
				return value;
			}
			throw new Error(`Non-regexp value "${value}" for ${name}`);

		case 'object':
			if (typeof value === 'string') {
				try {
					value = value ? JSON.parse(value) : {};
				} catch (error) {
					if (!requiredProperty) {
						throw new Error(
							`Non-object value "${value}" for ${name}`
						);
					}
					value = { [requiredProperty]: value };
				}
			}
			// A value of type 'object' should be a simple object, not a
			// built-in type like RegExp or Array
			if (Object.prototype.toString.call(value) === '[object Object]') {
				if (requiredProperty && !value[requiredProperty]) {
					throw new Error(
						`Invalid value "${JSON.stringify(value)}" for ${
							name
						}: missing '${requiredProperty}' property`
					);
				}
				return value;
			}
			throw new Error(`Non-object value "${value}" for ${name}`);

		case 'object[]':
			if (!value) {
				value = [];
			}
			if (!Array.isArray(value)) {
				value = [value];
			}
			return value.map((item: any) => {
				return parseValue(name, item, 'object', requiredProperty);
			});

		case 'string':
			if (typeof value === 'string') {
				return value;
			}
			throw new Error(`Non-string value "${value}" for ${name}`);

		case 'string[]':
			if (!value) {
				value = [];
			}
			if (typeof value === 'string') {
				value = [value];
			}
			if (
				Array.isArray(value) &&
				value.every(v => typeof v === 'string')
			) {
				return value;
			}
			throw new Error(`Non-string[] value "${value}" for ${name}`);

		default:
			if (typeof parser === 'function') {
				return parser(value);
			} else {
				throw new Error('Parser must be a valid type name');
			}
	}
}

/**
 * Remove JS-style line and block comments from a string
 */
function removeComments(text: string) {
	let state: 'string' | 'block-comment' | 'line-comment' | 'default' =
		'default';
	let i = 0;

	// Create an array of chars from the text, the blank out anything in a
	// comment
	const chars = text.split('');

	while (i < chars.length) {
		switch (state) {
			case 'block-comment':
				if (chars[i] === '*' && chars[i + 1] === '/') {
					chars[i] = ' ';
					chars[i + 1] = ' ';
					state = 'default';
					i += 2;
				} else if (chars[i] !== '\n') {
					chars[i] = ' ';
					i += 1;
				} else {
					i += 1;
				}
				break;

			case 'line-comment':
				if (chars[i] === '\n') {
					state = 'default';
				} else {
					chars[i] = ' ';
				}
				i += 1;
				break;

			case 'string':
				if (chars[i] === '"') {
					state = 'default';
					i += 1;
				} else if (chars[i] === '\\' && chars[i + 1] === '\\') {
					i += 2;
				} else if (chars[i] === '\\' && chars[i + 1] === '"') {
					i += 2;
				} else {
					i += 1;
				}
				break;

			default:
				if (chars[i] === '"') {
					state = 'string';
					i += 1;
				} else if (chars[i] === '/' && chars[i + 1] === '*') {
					chars[i] = ' ';
					chars[i + 1] = ' ';
					state = 'block-comment';
					i += 2;
				} else if (chars[i] === '/' && chars[i + 1] === '/') {
					chars[i] = ' ';
					chars[i + 1] = ' ';
					state = 'line-comment';
					i += 2;
				} else {
					i += 1;
				}
		}
	}

	return chars.join('');
}

/**
 * Set an option value.
 */
export function setOption<C extends Config>(
	config: C,
	name: keyof C,
	value: any,
	addToExisting = false
) {
	if (addToExisting) {
		const currentValue: any = config[name];
		if (currentValue == null) {
			config[name] = value;
		} else if (Array.isArray(currentValue)) {
			currentValue.push(...value);
		} else if (typeof config[name] === 'object') {
			config[name] = deepMixin({}, config[name], value);
		} else {
			throw new Error('Only array or object options may be added');
		}
	} else {
		config[name] = value;
	}
}

/**
 * Split a config path into a file name and a child config name.
 *
 * This allows for the case where a file name itself may include the config
 * separator (e.g., a scoped npm package).
 */
export function splitConfigPath(
	path: string
): { configFile: string; childConfig?: string } {
	const lastSep = path.lastIndexOf(configPathSeparator);
	if (lastSep === 0) {
		// path is like '@foo' -- specifies a child config
		return { configFile: '', childConfig: path.slice(1) };
	}
	if (
		lastSep === -1 ||
		path[lastSep - 1] === '/' ||
		path[lastSep - 1] === '\\'
	) {
		// path is like 'foo' or 'node_modules/@foo' -- specifies a
		// path
		return { configFile: path };
	}

	// path is like 'foo@bar' or 'node_modules/@foo@bar' -- specifies a path and
	// a child config
	return {
		configFile: path.slice(0, lastSep),
		childConfig: path.slice(lastSep + 1)
	};
}

const configPathSeparator = '@';
