import { sandbox as Sandbox, SinonStub } from 'sinon';
import global from '@dojo/shim/global';

import {
	createMockConsole,
	createMockNodeExecutor,
	MockConsole
} from '../../support/unit/mocks';

const mockRequire = intern.getPlugin<mocking.MockRequire>('mockRequire');
const originalIntern = global.intern;

registerSuite('bin/intern', function() {
	const sandbox = Sandbox.create();

	const originalExitCode = process.exitCode;

	let removeMocks: (() => void) | undefined;
	let mockConsole: MockConsole;
	let mockCommonConfig: { [name: string]: SinonStub };

	return {
		beforeEach() {
			mockConsole = createMockConsole();
			mockCommonConfig = {
				getConfigDescription: sandbox.stub().returns('test config'),
				getArgs: sandbox.stub().returns({}),
				parseArgs: sandbox.stub().returns({})
			};

			sandbox.resetHistory();
		},

		afterEach() {
			if (removeMocks) {
				removeMocks();
				removeMocks = undefined;
			}

			process.exitCode = originalExitCode;
			global.intern = originalIntern;
		},

		tests: {
			'basic run'() {
				const mockExecutor = createMockNodeExecutor();
				return mockRequire(require, 'src/bin/intern', {
					'src/lib/common/console': mockConsole,
					'src/lib/common/config': mockCommonConfig,
					'src/index': { default: mockExecutor },
					'@dojo/shim/global': { default: { process: {} } }
				}).then(handle => {
					removeMocks = handle.remove;
					assert.equal(
						mockCommonConfig.getConfigDescription.callCount,
						0
					);
					assert.isTrue(
						mockExecutor._ran,
						'expected executor to have run'
					);
				});
			},

			'bad run': {
				'intern defined'() {
					return mockRequire(require, 'src/bin/intern', {
						'src/lib/common/console': mockConsole,
						'src/lib/common/config': mockCommonConfig,
						'src/index': { default: createMockNodeExecutor() },
						'@dojo/shim/global': {
							default: { process: {} }
						}
					}).then(handle => {
						removeMocks = handle.remove;
						assert.equal(
							mockConsole.error.callCount,
							0,
							'expected error not to be called'
						);
					});
				},

				'intern not defined'() {
					mockCommonConfig.getConfigDescription.throws();

					return mockRequire(require, 'src/bin/intern', {
						'src/lib/common/console': mockConsole,
						'src/lib/common/config': mockCommonConfig,
						'src/index': { default: createMockNodeExecutor() },
						'@dojo/shim/global': {
							default: {
								process: { stdout: process.stdout }
							}
						}
					})
						.then(handle => {
							removeMocks = handle.remove;
							return new Promise(resolve =>
								setTimeout(resolve, 10)
							);
						})
						.then(() => {
							assert.equal(
								mockConsole.error.callCount,
								1,
								'expected error to be called once'
							);
						});
				}
			},

			help() {
				const mockExecutor = createMockNodeExecutor(<any>{
					_fileData: {
						'intern.json': {
							foo: 'one',
							bar: [2, 3],
							baz: { value: false }
						}
					}
				});

				return mockRequire(require, 'src/bin/intern', {
					'src/lib/common/console': mockConsole,
					'src/lib/common/config': mockCommonConfig,
					'src/lib/node/util': {
						getArgs: () => ({ help: true }),
						getConfigFile: () => 'intern.json'
					},
					'src/index': { default: mockExecutor },
					'@dojo/shim/global': {
						default: { process: {} }
					}
				}).then(handle => {
					removeMocks = handle.remove;
					assert.match(
						mockConsole.log.args[0][0],
						/intern version \d/
					);
					assert.match(mockConsole.log.args[1][0], /npm version \d/);
					assert.match(
						mockConsole.log.args[2][0],
						/node version v\d/
					);
					assert.deepEqual(mockConsole.log.args.slice(4), [
						[
							'Usage: intern [config=<file>] [showConfig|showConfigs] [options]'
						],
						[],
						['  config      - path to a config file'],
						['  showConfig  - show the resolved config'],
						['  showConfigs - show information about configFile'],
						[],
						["Options (set with 'option=value' or 'option'):\n"],
						['  bar - [2,3]'],
						['  baz - {"value":false}'],
						['  foo - "one"'],
						[],
						["Using config file 'intern.json':\n"],
						['test config']
					]);
				});
			}
		}
	};
});
