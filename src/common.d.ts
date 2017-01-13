import 'chai';
import Tunnel from 'digdug/Tunnel';
import Executor from './lib/executors/Executor';
import EnvironmentType from './lib/EnvironmentType';
import Test from './lib/Test';
import { Formatter } from './lib/util/format';
import Reporter from './lib/reporters/Reporter';
import Suite from './lib/Suite';
import Command = require('leadfoot/Command');
import Task from 'dojo-core/async/Task';

type BenchmarkMode = 'test' | 'baseline';

// export interface BenchmarkReporterDescriptor extends ReporterDescriptor {
// 	mode: BenchmarkMode;
// }

export interface Config {
	bail?: boolean;
	basePath?: string;
	baseline?: boolean;
	benchmark?: boolean;
	// benchmarkConfig?: BenchmarkReporterDescriptor;
	benchmarkSuites?: Suite[];
	capabilities?: {
		name?: string,
		build?: string,
		[key: string]: any
	};
	coverageVariable?: string;
	defaultTimeout?: number;
	environments?: { [key: string]: any }[];
	environmentRetries?: number;
	excludeInstrumentation?: true | RegExp;
	filterErrorStack?: boolean;
	formatter?: Formatter;
	functionalSuites?: Suite[];
	grep?: RegExp;
	instrumenterOptions?: any;
	leaveRemoteOpen?: 'fail' | boolean;
	maxConcurrency?: number;
	name?: string;
	proxyOnly?: boolean;
	proxyPort?: number;
	proxyUrl?: string;
	reporters?: Reporter[];
	runnerClientReporter?: {
		waitForRunner?: boolean
	};
	rootSuiteName?: string;
	sessionId?: string;
	setup?: (executor: Executor) => Task<any>;
	suites?: Suite[];
	teardown?: (executor: Executor) => Task<any>;
	tunnel?: typeof Tunnel;
	tunnelOptions?: {
		servers?: string[],
		[key: string]: any
	};
}

export interface CommandLineArguments {
	config?: string;
	excludeInstrumentation?: boolean | string | RegExp;
	loaders?: { [key: string]: string };
	[key: string]: any;
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

export interface Remote extends Command<any> {
	environmentType?: EnvironmentType;
	setHeartbeatInterval(delay: number): Command<any>;
}

export interface Removable {
	remove: () => void;
}

export interface ProxyConfig {
	basePath?: string;
	excludeInstrumentation?: boolean | RegExp;
	instrument?: boolean;
	instrumenterOptions?: any;
	port?: number;
	waitForRunner?: boolean;
}

export interface Proxy {
	config: ProxyConfig;
	server: Object; // http.Server; start(): Promise<void>; }
}

// export interface Reporter {
// 	console?: any;
// 	destroy?: () => void;
// 	coverage?: (sessionId: string, data?: Object) => Promise<any> | void;
// 	deprecated?: (name: string, replacement?: string, extra?: string) => Promise<any> | void;
// 	fatalError?: (error: Error) => Promise<any> | void;
// 	newSuite?: (suite: Suite) => Promise<any> | void;
// 	newTest?: (test: Test) => Promise<any> | void;
// 	proxyEnd?: (config: Proxy) => Promise<any> | void;
// 	proxyStart?: (config: Proxy) => Promise<any> | void;
// 	reporterError?: (reporter: Reporter, error: Error) => Promise<any> | void;
// 	runEnd?: (executor: Executor) => Promise<any> | void;
// 	runStart?: (executor: Executor) => Promise<any> | void;
// 	suiteEnd?: (suite: Suite) => Promise<any> | void;
// 	suiteError?: (suite: Suite, error: Error) => Promise<any> | void;
// 	suiteStart?: (suite: Suite) => Promise<any> | void;
// 	testEnd?: (test: Test) => Promise<any> | void;
// 	testFail?: (test: Test) => Promise<any> | void;
// 	testPass?: (test: Test) => Promise<any> | void;
// 	testSkip?: (test: Test) => Promise<any> | void;
// 	testStart?: (test: Test) => Promise<any> | void;
// 	tunnelDownloadProgress?: (tunnel: Tunnel, progress: { loaded: number, total: number }) => Promise<any> | void;
// 	tunnelEnd?: (tunnel: Tunnel) => Promise<any> | void;
// 	tunnelStart?: (tunnel: Tunnel) => Promise<any> | void;
// 	tunnelStatus?: (tunnel: Tunnel, status: string) => Promise<any> | void;
// 	$others?: (...args: any[]) => Promise<any> | void;
// }
