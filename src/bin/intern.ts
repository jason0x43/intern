#!/usr/bin/env node

import runner from '../lib/node/runner';
import { getConfig } from '../lib/node/util';

getConfig().then(rawConfig => {
	return runner(rawConfig);
}).catch(error => {
	console.error(error);
	process.exitCode = 1;
});
