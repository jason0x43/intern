#!/usr/bin/env node

//
//This is the runner script used to start Intern in a Node environment.
//

import { execSync } from 'child_process';
import global from '@dojo/shim/global';

import { getArgs, getConfigFile } from '../lib/node/config';
import { getConfigDescription } from '../lib/common/config';
import { ResourceConfig } from '../lib/executors/Executor';
import Node, { Config } from '../lib/executors/Node';
import _intern from '../index';
import * as console from '../lib/common/console';

const intern: Node = _intern;
const args = getArgs();

if (args.help) {
	printHelp(intern.config);
} else {
	intern
		.configure(getConfigFile())
		.then(() => {
			if (args.showConfigs) {
				console.log(getConfigDescription(intern.config));
			} else {
				if (!intern.config.config) {
					console.warn('No config file was loaded');
				}

				if (args) {
					// If any non-additive resources are specified in args, they
					// will apply to all environments and will override any
					// environment specific resources.
					const resources = ['plugins', 'reporters', 'suites'];
					const config = <any>intern.config;
					resources
						.filter(resource => resource in args)
						.forEach(res => {
							const resource = <keyof ResourceConfig>res;
							const environments = ['node', 'browser'];
							environments
								.filter(environment => config[environment])
								.forEach(environment => {
									config[environment][resource] = [];
								});
						});

					Object.keys(args).forEach(arg => {
						console.log('setting ' + arg + ' to', args[arg]);
						intern.setOption(arg, args[arg]);
					});
				}

				console.log('config:', intern.config);

				return intern.run();
			}
		})
		.catch(error => {
			// If intern wasn't initialized, then this error won't have been
			// reported
			if (!error.reported) {
				try {
					console.error(intern.formatError(error));
				} catch (e) {
					console.error(error);
				}
			}
			global.process.exitCode = 1;
		});
}

function printHelp(config: any) {
	const $ = (cmd: string) => execSync(cmd, { encoding: 'utf8' }).trim();
	const pkg = require(`${__dirname}/../../../package.json`);
	const npmVersion = $('npm -v');
	const nodeVersion = $('node -v');
	console.log(`intern version ${pkg.version}`);
	console.log(`npm version ${npmVersion}`);
	console.log(`node version ${nodeVersion}`);
	console.log();
	console.log(
		'Usage: intern [config=<file>] [showConfig|showConfigs] [options]'
	);
	console.log();
	console.log('  config      - path to a config file');
	console.log('  showConfig  - show the resolved config');
	console.log('  showConfigs - show information about configFile');
	console.log();
	console.log("Options (set with 'option=value' or 'option'):\n");

	const internConfig = (<any>intern)._config;
	const opts = Object.keys(internConfig)
		.map(key => {
			return { name: key, value: JSON.stringify(internConfig[key]) };
		})
		.sort((a, b) => {
			if (a.name < b.name) {
				return -1;
			}
			if (a.name > b.name) {
				return 1;
			}
			return 0;
		});
	const width = opts.reduce((max, opt) => Math.max(opt.name.length, max), 0);

	for (const { name, value } of opts) {
		const pad = Array(width - name.length + 1).join(' ');
		console.log(`  ${name}${pad} - ${value}`);
	}

	const file = config.config;
	if (file) {
		console.log();
		const description = getConfigDescription(config, '  ');
		if (description) {
			console.log(`Using config file '${file}':\n`);
			console.log(description);
		} else {
			console.log(`Using config file '${file}'`);
		}
	}
}
