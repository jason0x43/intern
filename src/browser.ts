import Browser, { Config } from './lib/executors/Browser';
import Html from './lib/reporters/Html';
import Console from './lib/reporters/Console';
import global from 'dojo-core/global';

export const reporters = {
	Html,
	Console
};

export * from './lib/executors/Browser';
export default Browser;

const config: Config = global['internConfig'] || {};
const executor = new Browser(config);

const globalName = config.internName || 'intern';
global[globalName] = executor;
