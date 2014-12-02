/*jshint node:true, es3:false */
if (typeof process !== 'undefined' && typeof define === 'undefined') {
	(function () {
		// this.require must be exposed explicitly in order to allow the loader to be
		// reconfigured from the configuration file
		var req = this.require = require('dojo/dojo');

		req({
			baseUrl: process.cwd(),
			packages: [
				{ name: 'intern', location: __dirname }
			],
			map: {
				intern: {
					dojo: 'intern/node_modules/dojo',
					chai: 'intern/node_modules/chai/chai',
					diff: 'intern/node_modules/diff/diff'
				},
				'*': {
					'intern/dojo': 'intern/node_modules/dojo'
				}
			}
		}, [ 'intern/launcher' ]);
	})();
}
else {
	define([
		'require',
		'./main',
		'./lib/createProxy',
		'dojo/node!path',
		'dojo/node!child_process',
		'./lib/args',
		'./lib/util',
		'./lib/Suite',
		'./lib/ClientSuite',
		'./lib/ProxiedSession',
		'dojo/lang',
		'dojo/topic',
		'dojo/request',
		'./lib/EnvironmentType',
		'./lib/reporterManager'
	], function (
		require,
		main,
		createProxy,
		pathUtil,
		childProcess,
		args,
		util,
		Suite,
		ClientSuite,
		ProxiedSession,
		lang,
		topic,
		request,
		EnvironmentType,
		reporterManager
	) {
		console.log('starting launcher...');

		if (!args.config) {
			throw new Error('Required option "config" not specified');
		}

		main.mode = 'runner';

		this.require([ args.config ], function (config) {
			/*jshint maxcomplexity:14 */
			main.config = config = lang.deepCopy({
				capabilities: {
					name: args.config,
					'idle-timeout': 60
				},
				loader: {},
				maxConcurrency: 3,
				proxyPort: 9000,
				proxyUrl: 'http://localhost:9000'
			}, config);

			// If the `baseUrl` passed to the loader is a relative path, it will cause `require.toUrl` to generate
			// non-absolute paths, which will break the URL remapping code in the `get` method of `lib/wd` (it will
			// slice too much data)
			if (config.loader.baseUrl) {
				config.loader.baseUrl = pathUtil.resolve(config.loader.baseUrl);
				args.config = pathUtil.relative(config.loader.baseUrl, pathUtil.resolve(args.config));
			}

			this.require(config.loader);

			if (args.grep || config.grep) {
				main.grep = (args.grep && new RegExp(args.grep)) || config.grep;
			}

			if (!args.reporters) {
				if (config.reporters) {
					args.reporters = config.reporters;
				}
				else {
					args.reporters = 'runner';
				}
			}

			if (args.functionalSuites === undefined) {
				args.functionalSuites = config.functionalSuites;
			}

			if (args.suites === undefined) {
				args.suites = config.suites;
			}

			// Using concat to convert to an array since `args.reporters` might be an array or a scalar
			args.reporters = [].concat(args.reporters).map(function (reporterModuleId) {
				// Allow 3rd party reporters to be used simply by specifying a full mid, or built-in reporters by
				// specifying the reporter name only
				if (reporterModuleId.indexOf('/') === -1) {
					reporterModuleId = './lib/reporters/' + reporterModuleId;
				}
				return reporterModuleId;
			});

			require(args.reporters, function () {
				// A hash map, { reporter module ID: reporter definition }
				var reporters = Array.prototype.slice.call(arguments, 0).reduce(function (map, reporter, i) {
					map[args.reporters[i]] = reporter;
					return map;
				}, {});

				reporterManager.add(reporters);

				// Publish an error, close the proxy if it's been started, and exit. The onExit handler will set the
				// exit code to the proper value.
				function exitWithError(error) {
					topic.publish('/error', error);
					proxy && proxy.close();
					process.exit();
				}

				(function () {
					var hasErrors = false;
					topic.subscribe('/error, /test/fail', function () {
						hasErrors = true;
					});
					process.on('exit', function () {
						// calling `process.exit` after the main test loop finishes will cause any remaining
						// in-progress operations to abort, which is undesirable if there are any asynchronous
						// I/O operations that a reporter wants to perform once all tests are complete; calling
						// from within the exit event avoids this problem by allowing Node.js to decide when to
						// terminate
						process.exit(hasErrors ? 1 : 0);
					});
					process.on('uncaughtException', exitWithError);
				})();

				config.proxyUrl = config.proxyUrl.replace(/\/*$/, '/');

				var basePath = pathUtil.join(config.loader.baseUrl || process.cwd(), '/');
				var proxy = createProxy({
					basePath: basePath,
					excludeInstrumentation: config.excludeInstrumentation,
					instrument: true,
					port: config.proxyPort
				});

				// Code in the runner should also provide instrumentation data; this is not normally necessary since
				// there shouldn’t typically be code under test running in the runner, but we do need this functionality
				// for testing leadfoot to avoid having to create the tunnel and proxy and so on ourselves
				util.setInstrumentationHooks(config, basePath);

				// Running just the proxy and aborting is useful mostly for debugging, but also lets you get code
				// coverage reporting on the client if you want
				if (args.proxyOnly) {
					return;
				}

				main.maxConcurrency = config.maxConcurrency || Infinity;

				if (process.env.TRAVIS_COMMIT) {
					config.capabilities.build = process.env.TRAVIS_COMMIT;
				}

				util.flattenEnvironments(config.capabilities, config.environments).forEach(function () {
					var suite = new Suite({
						name: 'main',
						publishAfterSetup: true,
						grep: main.grep,
						setup: function () {
							// var server = new Server(tunnel.clientUrl);
							// server.sessionConstructor = ProxiedSession;
							// return server.createSession(environmentType).then(function (session) {
							// 	session.coverageEnabled = true;
							// 	session.proxyUrl = config.proxyUrl;
							// 	session.proxyBasePathLength = basePath.length;

							// 	var command = new CompatCommand(session);
							// 	// TODO: Stop using remote.sessionId throughout the system
							// 	command.sessionId = session.sessionId;
							// 	suite.remote = command;

							// 	command.environmentType = new EnvironmentType(session.capabilities);
							// 	topic.publish('/session/start', command);
							// });
						},
						teardown: function () {
							var remote = this.remote;

							function endSession() {
								topic.publish('/session/end', remote);
							}

							if (args.leaveRemoteOpen) {
								return endSession();
							}

							return remote.quit().finally(endSession);
						}
					});

					// The `suites` flag specified on the command-line as an empty string will just get converted to an
					// empty array in the client, which means we can skip the client tests entirely. Otherwise, if no
					// suites were specified on the command-line, we rely on the existence of `config.suites` to decide
					// whether or not to client suites. If `config.suites` is truthy, it may be an empty array on the
					// Node.js side but could be a populated array when it gets to the browser side (conditional based
					// on environment), so we require users to explicitly set it to a falsy value to assure the test
					// system that it should not run the client
					if (args.suites) {
						suite.tests.push(new ClientSuite({ parent: suite, config: config }));
					}

					main.suites.push(suite);
				});

				// var proc = childProcess.spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
				// 	['http://localhost:9000/__intern/client.html?config=' + args.config +
				// 	'&reporters=webdriver']);
				var proc = childProcess.spawn('/Applications/Firefox.app/Contents/MacOS/firefox-bin',
					['http://localhost:9000/__intern/client.html?config=' + args.config +
					'&reporters=webdriver']);

				topic.subscribe('/client/end', function () {
					proc.kill();
					proxy.close();
					reporterManager.clear();
				});
			});
		});
	});
}
