import Node from '../src/lib/executors/Node';
import Test from '../src/lib/Test';
import { newConfig, parseCommandLine } from '../src/lib/parseArgs';

const config = newConfig({}, parseCommandLine(process.argv.slice(2)));
const executor = new Node(config);

executor.addTest(new Test({
	name: 'bar',
	test: () => console.log('testing')
}));

executor.run();
