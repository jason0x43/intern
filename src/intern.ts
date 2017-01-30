import Executor, { Config, Events, ExecutorConstructor, GenericExecutor } from './lib/executors/Executor';
import Test from './lib/Test';
import global from 'dojo-core/global';

declare global {
	// There will be one active executor
	export let intern: Executor;
}

/**
 * Create a new instance of an Executor and assign it to the global intern reference. This is the method that user code
 * should generally use to instantiate an executor since it ensures the global reference is created.
 */
export default function initialize<C extends Config, E extends Events, T extends GenericExecutor<E, C>>(
	ExecutorClass: ExecutorConstructor<E, C, T>, config?: C
): T {
	if (global['intern']) {
		throw new Error('Intern has already been initialized in this environment');
	}
	const executor = new ExecutorClass(config);
	global['intern'] = executor;
	return executor;
}

export interface InternError {
	name: string;
	message: string;
	stack?: string;
	showDiff?: boolean;
	actual?: string;
	expected?: string;
	relatedTest?: Test;
}
