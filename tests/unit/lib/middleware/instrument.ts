import * as sinon from 'sinon';

import _instrument from 'src/lib/middleware/instrument';
import Server from 'src/lib/Server';
import {
	createMockNodeExecutor,
	createMockServer,
	MockRequest,
	MockResponse,
	createMockServerContext
} from '../../../support/unit/mocks';
import { mockFs, mockPath, MockStats } from '../../../support/unit/nodeMocks';

const mockRequire = <mocking.MockRequire>intern.getPlugin('mockRequire');

registerSuite('lib/middleware/instrument', function() {
	let instrument: typeof _instrument;
	let removeMocks: () => void;

	let server: Server;
	let shouldInstrumentFile: sinon.SinonStub;
	let instrumentCode: sinon.SinonStub;
	let handler: (request: any, response: any, next: any) => any;
	let request: MockRequest;
	let response: MockResponse;
	let next: sinon.SinonSpy;

	const fs = mockFs();
	const path = mockPath();

	const sandbox = sinon.sandbox.create();

	return {
		before() {
			return mockRequire(require, 'src/lib/middleware/instrument', {
				fs,
				path,
				'src/lib/node/util': {
					normalizePath: (path: string) => path
				}
			}).then(resource => {
				removeMocks = resource.remove;
				instrument = resource.module.default;
			});
		},

		after() {
			removeMocks();
		},

		beforeEach() {
			fs.__fileData = {
				'/base/foo/thing.js': { type: 'file', data: 'what a fun time' }
			};
			server = createMockServer({
				basePath: '/base',
				executor: createMockNodeExecutor()
			});
			shouldInstrumentFile = sandbox.stub(
				server.executor,
				'shouldInstrumentFile'
			);
			instrumentCode = sandbox.stub(server.executor, 'instrumentCode');
			const context = createMockServerContext(server);
			handler = instrument(context);
			request = new MockRequest('GET', '/foo/thing.js');
			response = new MockResponse();
			next = sinon.spy();
		},

		afterEach() {
			sandbox.restore();
		},

		tests: {
			'instrumented file': {
				beforeEach() {
					shouldInstrumentFile.returns(true);
					instrumentCode.callsFake((code: string) => code);
				},

				tests: {
					successful() {
						handler(request, response, next);

						assert.isFalse(next.called);
						assert.equal(response.data, 'what a fun time');
						assert.strictEqual(
							response.statusCode,
							200,
							'expected success status for good file'
						);
					},

					'caches code'() {
						handler(request, response, next);
						handler(request, response, next);

						assert.isFalse(next.calledTwice);
						assert.isTrue(instrumentCode.calledOnce);
					},

					'non-existent'() {
						request.url = '/bar/thing.js';
						handler(request, response, next);

						assert.isTrue(next.calledOnce);
						assert.instanceOf(next.firstCall.args[0], Error);
						assert.strictEqual(next.firstCall.args[0].status, 404);
					},

					directory() {
						fs.__fileData['/base/foo/thing.js']!.type = 'directory';

						handler(request, response, next);

						assert.isTrue(next.calledOnce);
						assert.instanceOf(next.firstCall.args[0], Error);
						assert.strictEqual(next.firstCall.args[0].status, 404);
					},

					'read error'() {
						sandbox
							.stub(fs, 'stat')
							.callsFake((path: string, callback: any) => {
								const data =
									fs.__fileData['/base/foo/thing.js'];
								fs.__fileData['/base/foo/thing.js'] = undefined;
								callback(
									undefined,
									new MockStats(path, data!.type)
								);
							});
						handler(request, response, next);

						assert.isTrue(next.calledOnce);
						assert.instanceOf(next.firstCall.args[0], Error);
						assert.strictEqual(next.firstCall.args[0].status, 404);
					},

					'server stopped': {
						tests: {
							stat() {
								(server as any).stopped = true;
								const end = sinon.spy(response, 'end');
								handler(request, response, next);

								assert.isFalse(next.called);
								assert.isFalse(end.called);
							},

							readFile() {
								const { readFile } = fs;
								const end = sinon.spy(response, 'end');

								sandbox
									.stub(fs, 'readFile')
									.callsFake(
										(
											path: string,
											encoding: string,
											callback: any
										) => {
											(server as any).stopped = true;
											readFile(path, encoding, callback);
										}
									);
								handler(request, response, next);

								assert.isFalse(next.called);
								assert.isFalse(end.called);
							}
						},

						after() {
							if (server) {
								(<any>server).stopped = false;
							}
						}
					},

					HEAD() {
						request.method = 'HEAD';
						const end = sinon.spy(response, 'end');

						handler(request, response, next);

						assert.isFalse(next.called);
						assert.isTrue(end.calledOnce);
						assert.strictEqual(end.firstCall.args[0], '');
					}
				}
			},

			'non-instrumented file'() {
				shouldInstrumentFile.returns(false);
				const end = sinon.spy(response, 'end');

				handler(request, response, next);

				assert.isTrue(next.calledOnce, 'next should have been called');
				assert.isFalse(end.called, 'end should not have been called');
				assert.lengthOf(
					next.firstCall.args,
					0,
					'next should have been called with no arguments'
				);
			},

			POST() {
				request.method = 'POST';
				const end = sinon.spy(response, 'end');

				handler(request, response, next);

				assert.isTrue(next.calledOnce, 'next should have been called');
				assert.isFalse(end.called, 'end should not have been called');
				assert.lengthOf(
					next.firstCall.args,
					0,
					'next should have been called with no arguments'
				);
			}
		}
	};
});
