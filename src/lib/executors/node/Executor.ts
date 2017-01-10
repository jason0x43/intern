import BaseExecutor from '../Executor';
import { Config, ReporterDescriptor } from '../../../common';
import { setInstrumentationHooks } from '../../node/util';

export default class Executor extends BaseExecutor {
	constructor(config: Config) {
		super(config);

		if (this.config.benchmark) {
			this.config.benchmarkConfig.id = 'Benchmark';

			if (!this.config.reporters || !this.config.reporters.length) {
				this.config.reporters = [this.config.benchmarkConfig];
			}
			else if (!this.config.reporters.some(reporter => reporter === 'Benchmark' || (<ReporterDescriptor>reporter).id === 'Benchmark')) {
				this.config.reporters.push(this.config.benchmarkConfig);
			}
		}
	}

	enableInstrumentation(basePath: string, excludePaths: RegExp, instrumenterOptions: { [key: string]: string }) {
		return setInstrumentationHooks(excludePaths, basePath, instrumenterOptions);
	}
}
