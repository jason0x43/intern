import Session from 'leadfoot/Session';
import Task from 'dojo-core/async/Task';
import WebDriver from './executors/WebDriver';

/* istanbul ignore next: client-side code */
function getCoverageData(coverageVariable: string) {
	let coverageData = (function (this: any) { return this; })()[coverageVariable];
	return coverageData && JSON.stringify(coverageData);
}

/**
 * A ProxiedSession object represents a WebDriver session that interacts with the Intern instrumenting server. It
 * collects code instrumentation data from pages and converts local filesystem paths into URLs for use with
 * {@link module:leadfoot/Session#get}.
 *
 * @constructor module:intern/lib/ProxiedSession
 * @extends module:leadfoot/Session
 * @param {string} sessionId The ID of the session, as provided by the remote.
 * @param {module:leadfoot/Server} server The server that the session belongs to.
 * @param {Object} capabilities A map of bugs and features that the remote environment exposes.
 */
export default class ProxiedSession extends Session {
	/**
	 * Indicate whether coverage data should be requested before performing a request.
	 */
	coverageEnabled = false;

	/**
	 * The name of the global variable used to store coverage data.
	 */
	coverageVariable = '';

	/**
	 * The Executor hosting this session.
	 */
	executor: WebDriver;

	/**
	 * The number of characters that need to be truncated from the front of file paths to get a working path-part
	 * for a URL.
	 */
	serverBasePathLength = 0;

	/**
	 * The base URL of the server server in use.
	 */
	serverUrl = '';

	private _heartbeatIntervalHandle: { remove: Function };

	/**
	 * Navigates the browser to a new URL like {@link module:leadfoot/Session#get}, but retrieves any code coverage
	 * data recorded by the browser prior to navigation.
	 */
	get(url: string) {
		// At least two letters are required in the scheme to avoid Windows paths being misinterpreted as URLs
		if (!/^[A-Za-z][A-Za-z0-9+.-]+:/.test(url)) {
			if (url.indexOf(this.executor.config.basePath) === 0) {
				url = url.slice(this.serverBasePathLength);
			}

			url = this.serverUrl + url;
		}

		if (!this.coverageEnabled) {
			return super.get(url);
		}

		let shouldGetPromise: Task<boolean>;

		// At least Safari will not inject user scripts for non http/https URLs, so we can't get coverage data.
		if (this.capabilities.brokenExecuteForNonHttpUrl) {
			shouldGetPromise = Task.resolve(this.getCurrentUrl().then(url => (/^https?:/i).test(url)));
		}
		else {
			shouldGetPromise = Task.resolve(true);
		}

		const task: Task<void> = shouldGetPromise.then(shouldGetCoverage => {
			if (shouldGetCoverage) {
				return this.execute<string>(getCoverageData, [ this.coverageVariable ]).then(coverageData => {
					return coverageData && this.executor.emit('coverage', {
						sessionId: this.sessionId,
						coverage: JSON.parse(coverageData)
					});
				});
			}
		}).finally(() => {
			return super.get(url);
		});

		return task;
	}

	/**
	 * Quits the browser like {@link module:leadfoot/Session#quit}, but retrieves any code coverage data recorded
	 * by the browser prior to quitting.
	 */
	quit() {
		return this
			.setHeartbeatInterval(0)
			.then(() => {
				if (this.coverageEnabled) {
					return this.execute<string>(getCoverageData, [ this.coverageVariable ]).then(coverageData => {
						return coverageData && this.executor.emit('coverage', {
							sessionId: this.sessionId,
							coverage: JSON.parse(coverageData)
						});
					});
				}
			})
			.finally(() => {
				return super.quit();
			});
	}

	/**
	 * Sets up a timer to send no-op commands to the remote server on an interval to prevent long-running unit tests
	 * from causing the session to time out.
	 *
	 * @param delay Amount of time to wait between heartbeats. Setting the delay to 0 will disable heartbeats.
	 */
	setHeartbeatInterval(delay: number) {
		this._heartbeatIntervalHandle && this._heartbeatIntervalHandle.remove();

		if (delay) {
			// A heartbeat command is sent immediately when the interval is set because it is unknown how long ago
			// the last command was sent and it simplifies the implementation by requiring only one call to
			// `setTimeout`
			const self = this;
			(function sendHeartbeat() {
				let timeoutId: NodeJS.Timer;
				let cancelled = false;
				let startTime = Date.now();

				self._heartbeatIntervalHandle = {
					remove: function () {
						cancelled = true;
						clearTimeout(timeoutId);
					}
				};

				self.getCurrentUrl().then(() => {
					if (!cancelled) {
						timeoutId = setTimeout(sendHeartbeat, delay - (Date.now() - startTime));
					}
				}).catch(error => {
					self.executor.emit('error', error);
				});
			})();
		}

		return Task.resolve();
	}
}
