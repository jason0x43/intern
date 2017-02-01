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
