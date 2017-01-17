import browserify = require('browserify');
import { buildDir } from 'intern-dev/common';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { red } from 'chalk';

const b = browserify();
const srcDir = join(buildDir, 'src');

b.add(join(srcDir, 'browser.js'));
b.bundle((error, data) => {
	if (error) {
		console.log(red(error));
		process.exit(1);
	}
	writeFileSync(join(srcDir, 'bundle.js'), data);
});
