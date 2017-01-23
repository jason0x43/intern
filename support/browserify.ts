import browserify = require('browserify');
import { echo, mkdir, test } from 'shelljs';
import { buildDir } from 'intern-dev/common';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';
import { red } from 'chalk';

const srcDir = join(buildDir, 'src');
const dstDir = join(buildDir, 'browser');

const testDir = join(buildDir, 'tests');
const testDstDir = join(buildDir, 'browser', 'tests');

echo('## Browserifying');

function bundle(files: string | string[], output: string) {
	const b = browserify(files);
	return new Promise((resolve, reject) => {
		b.bundle((error, data) => {
			if (error) {
				reject(error);
			}
			else {
				resolve(data);
			}
		});
	}).then(data => {
		const outputDir = dirname(output);
		if (!test('-d', outputDir)) {
			mkdir('-p', outputDir);
		}
		writeFileSync(output, data);
	});
}

(async function () {
	let exitCode = 0;

	try {
		if (!test('-d', dstDir)) {
			mkdir('-p', dstDir);
		}

		await bundle(join(srcDir, 'browser.js'), join(dstDir, 'browser.js'));
		await bundle(join(testDir, 'unit', 'all.js'), join(testDstDir, 'unit', 'all.js'));
	}
	catch (error) {
		echo(red(error));
		exitCode = 1;
	}
	finally {
		echo('## Done Browserifying');
		process.exit(exitCode);
	}
})();
