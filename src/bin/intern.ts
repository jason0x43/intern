#!/usr/bin/env node

/**
 * This is the built-in runner script used to start Intern in a Node environment.
 */

import runner from '../lib/node/runner';
import { getConfig } from '../lib/node/util';

getConfig().then(runner).catch(_error => {
	process.exitCode = 1;
});
