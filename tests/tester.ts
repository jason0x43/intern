import Client from '../src/lib/executors/node/Client';
import Test from '../src/lib/Test';
import { newConfig, parseCommandLine } from '../src/lib/parseArgs';

const config = newConfig({}, parseCommandLine(process.argv.slice(2)));

const client = new Client(config);

client.register(rootSuite => {
	rootSuite.add(new Test({
		name: 'bar',
		test: () => console.log('testing')
	}));
});

client.run();
