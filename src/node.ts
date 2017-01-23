import Node from './lib/executors/Node';
import { GlobalConfig } from './common';
import global from 'dojo-core/global';
import Pretty from './lib/reporters/Pretty';
import Simple from './lib/reporters/Simple';

const config: GlobalConfig = global['internConfig'] || {};
const globalName = config.internName || 'intern';
const executor = new Node(config.config);

global[globalName] = {
	executor,
	reporters: {
		simple: Simple,
		pretty: Pretty
	}
};
