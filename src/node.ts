import Node, { Config } from './lib/executors/Node';
import global from 'dojo-core/global';

export default function (config?: Config) {
	let globalName = config.internName;
	if (!globalName) {
		if (global['internConfig'] && global['internConfig']['internName']) {
			globalName = global['internConfig']['internName'];
		}
	}
	else {
		if (!global['internConfig']) {
			global['internConfig'] = {};
		}
		global['internConfig']['internName'] = globalName;
	}

	globalName = globalName || 'intern';

	if (global[globalName]) {
		throw new Error(`An executor has already been installed at "${globalName}"`);
	}

	const executor = new Node(config);
	global[globalName] = executor;

	return executor;
}

export * from './lib/executors/Node';
