import { Config as BaseConfig, Events, GenericBrowser } from './Browser';
import { initialize } from './Executor';
import Task from 'dojo-core/async/Task';
import { parseValue } from '../util';
import Dom from '../reporters/Dom';

/**
 * An executor for running suites in a remote browser.
 */
export default class Remote extends GenericBrowser<Events, Config> {
	static initialize(config?: Config) {
		return initialize<Events, Config, Remote>(Remote, config);
	}

	protected _debug: boolean;

	constructor(config: Config) {
		super(config);

		this.registerReporter('dom', Dom);
		this.config.reporters.push('dom');
	}

	/**
	 * Override Executor#_emitCoverage to include the session ID
	 */
	protected _emitCoverage(coverage: any): Task<any> {
		return this.emit('coverage', { sessionId: this.config.sessionId, coverage });
	}

	protected _processOption(name: keyof Config, value: any) {
		switch (name) {
			case 'runInSync':
				this._debug = parseValue(name, value, 'boolean');
				break;

			case 'sessionId':
				this.config[name] = parseValue(name, value, 'string');
				break;

			case 'socketPort':
				this.config[name] = parseValue(name, value, 'number');
				break;

			default:
				super._processOption(name, value);
				break;
		}
	}
}

export { Events }

export interface Config extends BaseConfig {
	runInSync?: boolean;
	sessionId?: string;
	socketPort?: number;
}
