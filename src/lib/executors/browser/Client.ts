import { Config } from '../../../common';
import BaseClient from '../Client';

export default class Client extends BaseClient {
	constructor(config: Config) {
		super(config);
		this.config.reporters.push('Html');
	}
}
