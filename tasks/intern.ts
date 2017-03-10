import Node, { Config as NodeConfig } from 'intern/Node';
import WebDriver, { Config as WdConfig } from 'intern/WebDriver';
import { join } from 'path';

interface TaskOptions extends grunt.task.ITaskOptions {
	cwd?: string;
	nodeOptions?: any;
	runType?: string;
	[key: string]: any;
}

export = function (grunt: IGrunt) {
	function loadSuites(suites: string[]) {
		const suiteFiles = suites.map((suite: string) => {
			return /\.js$/.test(suite) ? suite : suite + '.js';
		});

		grunt.file.expand(suiteFiles).forEach((suite: string) => {
			require(join(process.cwd(), suite));
			grunt.log.writeln(`Loaded suite ${suite}`);
		});
	}

	grunt.registerMultiTask('intern', function () {
		const done = this.async();
		const options = this.options<TaskOptions>({
			runType: 'client',
			suites: [],
			functionalSuites: []
		});
		const skipOptions: { [key: string]: boolean } = {
			browserstackAccessKey: true,
			browserstackUsername: true,
			cbtApikey: true,
			cbtUsername: true,
			runType: true,
			sauceAccessKey: true,
			sauceUsername: true,
			testingbotKey: true,
			testingbotSecret: true,
			suites: true,
			functionalSuites: true
		};

		[
			'browserstackAccessKey',
			'browserstackUsername',
			'cbtApikey',
			'cbtUsername',
			'sauceAccessKey',
			'sauceUsername',
			'testingbotKey',
			'testingbotSecret'
		].filter(option => Boolean(options[option])).forEach(option => {
			process.env[option.replace(/[A-Z]/g, '_$&').toUpperCase()] = options[option];
		});

		// force colored output for istanbul report
		process.env.FORCE_COLOR = true;

		const internOptions = Object.keys(options).filter(option => !skipOptions[option]);

		if (options.runType === 'webdriver') {
			const config: WdConfig = {
				environments: [ { browserName: 'chrome' } ],
				filterErrorStack: true,
				tunnel: 'selenium' as 'selenium',
				tunnelOptions: { drivers: [ 'chrome' ] },
				suites: options.suites
			};

			internOptions.forEach((option: keyof WdConfig) => {
				config[option] = options[option];
			});

			WebDriver.initialize(config);
			grunt.log.writeln('Initialized WebDriver executor');

			loadSuites(options.functionalSuites);
		}
		else {
			const config: NodeConfig = {
				filterErrorStack: true
			};

			internOptions.forEach((option: keyof NodeConfig) => {
				config[option] = options[option];
			});

			Node.initialize(config);
			grunt.log.writeln('Initialized Node executor');

			loadSuites(options.suites);
		}

		intern.run().then(done, done);
	});
};
