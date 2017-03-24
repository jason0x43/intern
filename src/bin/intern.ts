#!/usr/bin/env node

import runner from '../lib/node/runner';
import { getConfig } from '../lib/node/util';

getConfig().then(runner).catch(error => {
	console.error(error);
	process.exitCode = 1;
});
