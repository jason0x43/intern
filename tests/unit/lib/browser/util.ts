import { spy, SinonSpy } from 'sinon';
import Task from '@dojo/core/async/Task';

import * as _util from 'src/lib/browser/util';

const mockRequire = intern.getPlugin<mocking.MockRequire>('mockRequire');

registerSuite('lib/browser/util', function() {
	class MockResponse {
		data: string | undefined;
		ok: boolean;
		status: number;

		constructor(data?: string) {
			this.data = data;
			this.ok = data != null;
			this.status = this.ok ? 200 : 404;
		}

		text() {
			return Task.resolve(this.data);
		}
	}

	const request = spy((path: string) => {
		const data = requestData && requestData[path];
		return Task.resolve(new MockResponse(data));
	});

	let util: typeof _util;
	let parsedArgs: { [key: string]: string | string[] };
	let requestData: { [name: string]: string };
	let removeMocks: () => void;

	const mockConfig: { [name: string]: SinonSpy } = {
		getBasePath: spy((_path: string) => {
			return '';
		}),

		loadConfig: spy(
			(
				filename: string,
				loadText: (filename: string) => Promise<string>,
				_args?: string[],
				_childConfig?: string
			) => {
				return loadText(filename).then(text => {
					return JSON.parse(text);
				});
			}
		),

		parseArgs: spy(() => {
			return parsedArgs;
		}),

		splitConfigPath: spy((path: string) => {
			const parts = path.split('@');
			return { configFile: parts[0], childConfig: parts[1] };
		})
	};

	return {
		before() {
			return mockRequire(require, 'src/lib/browser/util', {
				'@dojo/core/request/providers/xhr': { default: request },
				'@dojo/shim/global': {
					default: { location: { pathname: '/' } }
				},
				'src/lib/common/config': mockConfig
			}).then(handle => {
				removeMocks = handle.remove;
				util = handle.module;
			});
		},

		after() {
			removeMocks();
		},

		beforeEach() {
			parsedArgs = {};
			requestData = {};
			request.reset();
			Object.keys(mockConfig).forEach(key => mockConfig[key].reset());
		},

		tests: {
			normalizePath() {
				assert.equal(util.normalizePath('/foo/bar'), '/foo/bar');
				assert.equal(util.normalizePath('/foo/.././bar'), '/bar');
				assert.equal(util.normalizePath('.././bar'), '../bar');
			},

			parseQuery() {
				const rawArgs = util.parseQuery('foo&bar=5&baz=6&baz=7&baz=8');
				const expected = ['foo', 'bar=5', 'baz=6', 'baz=7', 'baz=8'];
				assert.deepEqual(rawArgs, expected);
			},

			parseUrl() {
				const url = util.parseUrl(
					'http://www.foo.com:80/some/local/document.md?foo=bar&location=my%20house#kitchen'
				);
				assert.propertyVal(url, 'protocol', 'http');
				assert.propertyVal(url, 'hostname', 'www.foo.com');
				assert.propertyVal(url, 'port', '80');
				assert.propertyVal(url, 'path', '/some/local/document.md');
				assert.propertyVal(url, 'query', 'foo=bar&location=my%20house');
				assert.propertyVal(url, 'hash', 'kitchen');
			}
		}
	};
});
