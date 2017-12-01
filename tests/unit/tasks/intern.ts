import * as sinon from 'sinon';
import _gruntTask from 'src/tasks/intern';

const mockRequire = intern.getPlugin<mocking.MockRequire>('mockRequire');

registerSuite('tasks/intern', function() {
	const sandbox = sinon.sandbox.create();

	let mockDone: sinon.SinonSpy;

	function setupDone() {
		return new Promise(resolve => {
			mockDone = sinon.spy(() => resolve());
		});
	}

	const mockGrunt = {
		registerMultiTask: sandbox.stub(),
		async: sandbox.spy(() => mockDone),
		options: sandbox.stub()
	};

	const mockRun = sandbox.stub().resolves();
	const mockConfigure = sandbox.stub().resolves();

	class MockNode {
		run: Function;
		configure: Function;
		constructor() {
			executors.push(this);
			this.run = mockRun;
			this.configure = mockConfigure;
		}
	}

	let gruntTask: typeof _gruntTask;
	let executors: MockNode[];
	let removeMocks: () => void;

	return {
		before() {
			return mockRequire(require, 'src/tasks/intern', {
				'src/lib/executors/Node': { default: MockNode },
				'@dojo/shim/global': { default: {} }
			}).then(handle => {
				removeMocks = handle.remove;
				gruntTask = handle.module;
			});
		},

		after() {
			removeMocks();
		},

		beforeEach() {
			sandbox.resetHistory();
			executors = [];
		},

		tests: {
			'task registration'() {
				gruntTask(<any>mockGrunt);

				assert.equal(
					mockGrunt.registerMultiTask.callCount,
					1,
					'task should have registered'
				);
				assert.equal(
					mockGrunt.registerMultiTask.getCall(0).args[0],
					'intern',
					'unexpected task name'
				);
			},

			'run task': {
				config() {
					mockGrunt.registerMultiTask.callsArgOn(1, mockGrunt);
					mockGrunt.options.returns({
						config: '@coverage',
						foo: 'bar'
					});
					const done = setupDone();

					gruntTask(<any>mockGrunt);

					return done.then(() => {
						assert.lengthOf(
							executors,
							1,
							'1 executor should have been created'
						);
						assert.equal(
							mockRun.callCount,
							1,
							'intern should have been run'
						);
						assert.equal(mockConfigure.args[0][0], '@coverage');
						assert.equal(mockConfigure.callCount, 2);
						assert.equal(mockDone.callCount, 1);
						// First arg is an error, so it should be undefined here
						assert.isUndefined(mockDone.getCall(0).args[0]);
					});
				},

				'no config'() {
					mockGrunt.registerMultiTask.callsArgOn(1, mockGrunt);
					mockGrunt.options.returns({
						foo: 'bar'
					});
					const done = setupDone();

					gruntTask(<any>mockGrunt);

					return done.then(() => {
						assert.lengthOf(
							executors,
							1,
							'1 executor should have been created'
						);
						assert.equal(
							mockRun.callCount,
							1,
							'intern should have been run'
						);
						assert.equal(mockConfigure.callCount, 1);
						assert.deepEqual(mockConfigure.getCall(0).args[0], {
							foo: 'bar'
						});
						assert.equal(mockDone.callCount, 1);
						// First arg is an error, so it should be undefined here
						assert.isUndefined(mockDone.getCall(0).args[0]);
					});
				}
			},

			error() {
				mockGrunt.registerMultiTask.callsArgOn(1, mockGrunt);
				mockGrunt.options.returns({
					foo: 'bar'
				});
				const error = new Error('bad');
				mockRun.rejects(error);

				const done = setupDone();

				gruntTask(<any>mockGrunt);

				return done.then(() => {
					assert.lengthOf(
						executors,
						1,
						'1 executor should have been created'
					);
					assert.equal(
						mockRun.callCount,
						1,
						'intern should have been run'
					);
					assert.equal(mockDone.callCount, 1);
					assert.equal(mockDone.getCall(0).args[0], error);
				});
			}
		}
	};
});
