import { BenchmarkTestFunction } from '../../src/lib/BenchmarkTest';

const { registerSuite, async } = intern.getInterface('benchmark');

registerSuite({
	name: 'example benchmarks',

	tests: {
		test1() {
			2 * 2;
		},

		test2: (function () {
			const test: BenchmarkTestFunction = function () {
				[1, 2, 3, 4, 5].forEach(function (item) {
					item = item * item;
				});
			};

			test.options = {
			};

			return test;
		})(),

		nested: (function () {
			let counter = 0;

			return {
				beforeEachLoop() {
					counter = 0;
				},

				tests: {
					nested1() {
						counter * 23;
					},

					nested2() {
						counter / 12;
					}
				}
			};
		})(),

		async: async(function (_test, deferred) {
			setTimeout(deferred.callback(function () {
				return 23 / 400;
			}), 200);
		}),

		skip() {
			this.skip('this also does nothing now');
		},

		'async skip'() {
			this.skip('this also does nothing now');
		}
	}
});
