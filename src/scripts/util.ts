declare global {
	export let internLoader: SuiteLoader;
}

export function loadScript(script: string, basePath: string) {
	return new Promise((resolve, reject) => {
		const src = basePath + script;
		const scriptTag = document.createElement('script');
		scriptTag.addEventListener('load', resolve);
		scriptTag.addEventListener('error', event => {
			console.error(`Error loading ${src}:`, event);
			reject(new Error(`Unable to load ${src}`));
		});
		scriptTag.src = src;
		document.body.appendChild(scriptTag);
	});
}

export function getQueryParams() {
	const rawParams = location.search.slice(1).split('&').filter(arg => {
		return arg !== '' && arg[0] !== '=';
	}).map(arg => {
		const parts = arg.split('=');
		return {
			name: decodeURIComponent(parts[0]),
			// An arg name with no value is treated as having the value 'true'
			value: (parts[1] && decodeURIComponent(parts[1])) || true
		};
	});

	const params: { [key: string]: string | boolean | (string | boolean)[] } = {};
	rawParams.forEach(({ name, value }) => {
		if (!(name in params)) {
			params[name] = value;
		}
		else if (!Array.isArray(params[name])) {
			params[name] = [<string | boolean>params[name], value];
		}
		else {
			(<(string | boolean)[]>params[name]).push(value);
		}
	});

	return params;
}

export interface SuiteLoader {
	loaded: Promise<any>;
}
