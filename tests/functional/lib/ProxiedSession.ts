import { assert } from 'chai';
import ProxiedSession from '../../../src/lib/ProxiedSession';
import Server = require('leadfoot/Server');

const { registerSuite } = intern.getInterface('object');

registerSuite(function () {
	const proxyUrl = 'https://example.invalid/';
	const proxyBasePathLength = 1;
	let session: any;
	let oldGet: any;
	let oldPost: any;
	let oldDelete: any;
	let numGetCalls: number;
	let lastUrl: string;
	let mockCoverage = { isMockCoverage: true };

	function sleep(ms: number) {
		return new Promise(resolve => {
			setTimeout(resolve, ms);
		});
	}

	function createServerFromRemote(remote: any): Server<ProxiedSession> {
		// Intern 2
		if (remote.session && remote.session.server) {
			return new Server(remote.session.server.url, null);
		}
		// Intern 1
		else if (remote._wd) {
			return new Server(remote._wd.configUrl.href, null);
		}

		throw new Error('Unsupported remote');
	}

	function createProxiedSessionFromRemote(remote: any): any {
		const server = createServerFromRemote(remote);
		let session: ProxiedSession;

		// Intern 2
		if (remote.session) {
			session = new ProxiedSession(remote.session.sessionId, server, remote.session.capabilities);
			return Promise.resolve(session);
		}
		// Intern 1
		else if (remote.sessionId && remote.environmentType) {
			// capabilities on Intern 1.6- remote objects are exposed through the environment type object,
			// but that object contains some additional features that causes a deepEqual comparison to fail;
			// extracting its own properties onto a plain object ensures that capabilities comparison passes,
			// assuming the server is not defective
			const capabilities: any = {};
			for (let k in remote.environmentType) {
				if (remote.environmentType.hasOwnProperty(k)) {
					capabilities[k] = (<any> remote.environmentType)[k];
				}
			}

			session = new ProxiedSession(remote.sessionId, server, capabilities);
			return server._fillCapabilities(session);
		}

		throw new Error('Unsupported remote');
	}

	function createCoverageTest(method: string) {
		return function () {
			let coverageArgs: any;
			let oldCoverage = session.coverageEnabled;
			let oldCoverageVariable = session.coverageVariable;
			session.coverageEnabled = true;
			session.coverageVariable = '__testCoverage';
			session.reporterManager = {
				emit(eventName: string) {
					if (eventName === 'coverage') {
						coverageArgs = Array.prototype.slice.call(arguments, 1);
					}
				}
			};

			let url = method === 'get' ? 'http://example.invalid/' : undefined;
			return session[method](url).then(function () {
				assert.ok(coverageArgs);
				assert.strictEqual(coverageArgs[0], session.sessionId,
					'Correct session ID should be provided when broadcasting coverage data');
				assert.deepEqual(coverageArgs[1], mockCoverage,
					'Code coverage data retrieved from session should be broadcasted');
			}).finally(function () {
				session.coverageEnabled = oldCoverage;
				session.coverageVariable = oldCoverageVariable;
			});
		};
	}

	return {
		name: 'ProxiedSession',

		setup() {
			return createProxiedSessionFromRemote(this.remote).then(function () {
				session = arguments[0];
				session.proxyUrl = proxyUrl;
				session.proxyBasePathLength = proxyBasePathLength;

				oldGet = session._get;
				oldPost = session._post;
				oldDelete = session.server.deleteSession;

				session._get = function () {
					++numGetCalls;
					return Promise.resolve(lastUrl);
				};

				session._post = function (path: string, data: any) {
					if (path === 'url') {
						lastUrl = data.url;
					}
					else if (path === 'execute' && data.args && data.args[0] === '__testCoverage') {
						return Promise.resolve(JSON.stringify(mockCoverage));
					}

					return Promise.resolve();
				};

				session.server.deleteSession = function () {
					return Promise.resolve();
				};
			});
		},

		beforeEach() {
			return session.setHeartbeatInterval(0).then(function () {
				numGetCalls = 0;
				lastUrl = undefined;
			});
		},

		teardown() {
			if (session) {
				session._get = oldGet;
				session._post = oldPost;
				session.server.deleteSession = oldDelete;
			}
		},

		tests: {
			'#get URL'() {
				return session.get('http://example.invalid/')
					.then(function () {
						assert.strictEqual(lastUrl, 'http://example.invalid/', 'Real URLs should be passed as-is');
					});
			},

			'#get local file'() {
				// return session.get(require.toUrl('./test'))
				// 	.then(function () {
				// 		assert.strictEqual(lastUrl, proxyUrl + 'test',
				// 			'Local URLs should be converted according to defined proxy URL and base path length');
				// 	});
			},

			'#get coverage': createCoverageTest('get'),

			'#quit coverage': createCoverageTest('quit'),

			'#setHeartbeatInterval'() {
				let lastNumGetCalls: number;
				return session.setHeartbeatInterval(50).then(function () {
					return sleep(250);
				}).then(function () {
					assert.closeTo(numGetCalls, 5, 1, 'Heartbeats should occur on the given interval');
					lastNumGetCalls = numGetCalls;

					return session.setHeartbeatInterval(0);
				}).then(function () {
					return sleep(100);
				}).then(function () {
					assert.strictEqual(numGetCalls, lastNumGetCalls,
						'No more heartbeats should occur after being disabled');
				});
			}
		}
	};
});
