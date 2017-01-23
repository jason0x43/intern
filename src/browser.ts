import Browser from './lib/executors/Browser';

function getThisPath() {
	const scripts = document.getElementsByTagName('script');
	let script: HTMLScriptElement;
	for (let i = 0; i < scripts.length; i++) {
		script = scripts[i];
		if (/\/browser\.js\b/.test(script.src)) {
			return script.src;
		}
	}
}

const thisPath = getThisPath();
const basePath = thisPath.split('/').slice(0, -1).join('/');

// TODO: don't do this in the final version
const devBasePath = basePath.split('/').slice(0, -1).concat('src').join('/');

new Browser({ basePath: devBasePath });
