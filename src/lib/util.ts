/**
 * Remove all instances of of an item from any array and return the removed instances.
 */
export function pullFromArray<T>(haystack: T[], needle: T): T[] {
	let removed: T[] = [];
	let i = 0;

	while ((i = haystack.indexOf(needle, i)) > -1) {
		removed.push(haystack.splice(i, 1)[0]);
	}

	return removed;
}

/**
 * Indicate whether Proxy or WebDriver should wait for an event to process
 * before continuing.
 */
export function getShouldWait(waitMode: (string|boolean), message: string|any[]) {
	let shouldWait = false;
	let eventName = message[0];

	if (waitMode === 'fail') {
		if (
			eventName === 'testFail' ||
			eventName === 'suiteError' ||
			eventName === 'fatalError'
		) {
			shouldWait = true;
		}
	}
	else if (waitMode === true) {
		shouldWait = true;
	}
	else if (Array.isArray(waitMode) && waitMode.indexOf(eventName) !== -1) {
		shouldWait = true;
	}

	return shouldWait;
}

/**
 * Run an async callback until it resolves, up to numRetries times
 */
export function retry(callback: Function, numRetries: number) {
	let numAttempts = 0;
	return callback().catch(function retry(error: Error) {
		if (error.name !== 'CancelError' && ++numAttempts <= numRetries) {
			return callback().catch(retry);
		}
		else {
			throw error;
		}
	});
}
