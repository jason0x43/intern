import Executor, { Config } from './Executor';
import Formatter from '../browser/Formatter';
import Html from '../reporters/Html';
import global from 'dojo-core/global';

export { Config };

export default class Browser extends Executor {
	constructor(config: Config) {
		super(config);

		const globalName = this.config.name || 'intern';
		if (global[globalName]) {
			throw new Error(`An executor has already been installed at "${globalName}"`);
		}
		global[globalName] = this;

		this._formatter = new Formatter(config);
		this.addReporter(new Html());
	}
}
