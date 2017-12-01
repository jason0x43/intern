import global from '@dojo/shim/global';

import Node, { Config } from '../lib/executors/Node';

export = function(grunt: IGrunt) {
	grunt.registerMultiTask('intern', function() {
		const done = this.async();
		const options = this.options<TaskOptions>({});

		const { config } = options;
		delete options.config;

		// Force colored output for istanbul report
		process.env.FORCE_COLOR = 'true';

		const intern = (global.intern = new Node());
		let promise = config ? intern.configure(config) : Promise.resolve();

		promise
			.then(() => intern.configure(options))
			.then(() => intern.run())
			.then(finish, finish);

		function finish(error?: any) {
			global.intern = null;
			done(error);
		}
	});
};

interface TaskOptions extends grunt.task.ITaskOptions, Partial<Config> {
	[key: string]: any;
}
