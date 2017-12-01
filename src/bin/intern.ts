#!/usr/bin/env node

//
//This is the runner script used to start Intern in a Node environment.
//

import { execSync } from 'child_process';
import global from '@dojo/shim/global';

import { getArgs, getConfigFile } from '../lib/node/util';
import { getConfigDescription } from '../lib/common/config';
import Node from '../lib/executors/Node';
import _intern from '../index';
import * as console from '../lib/common/console';

const intern: Node = _intern;
const args = getArgs();

intern
	.configure(getConfigFile())
	.then(() => {
		if (args.help) {
			printHelp(intern.config);
		} else if (args.showConfigs) {
			console.log(getConfigDescription(intern.config));
		} else {
			if (!intern.config.config) {
				console.warn('No config file was loaded');
			}

			if (args) {
				Object.keys(args).forEach(arg => {
					intern.setOption(arg, args[arg], true);
				});
			}

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

	const opts = Object.keys(config)
		.filter(
			key =>
				key !== 'config' &&
				key !== 'showConfig' &&
				key !== 'showConfigs'
		)
		.map(key => {
			return { name: key, value: JSON.stringify(config[key]) };
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
