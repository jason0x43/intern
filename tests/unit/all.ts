import './main';
import './order';
import './lib/BenchmarkTest';
import './lib/EnvironmentType';
import './lib/Suite';
import './lib/Test';
import './lib/util';
import './lib/ReporterManager';
import './lib/executors/PreExecutor';
import './lib/interfaces/tdd';
import './lib/interfaces/bdd';
import './lib/interfaces/benchmark';
import './lib/interfaces/object';
import './lib/interfaces/qunit';
import './lib/reporters/Console';
import './lib/resolveEnvironments';

import 'dojo/has!host-node?./lib/Proxy';
import 'dojo/has!host-node?./lib/reporters/Pretty';
import 'dojo/has!host-node?./lib/reporters/TeamCity';
import 'dojo/has!host-node?./lib/reporters/JUnit';
import 'dojo/has!host-node?./lib/reporters/Lcov';
import 'dojo/has!host-node?./lib/reporters/JsonCoverage';
import 'dojo/has!host-node?./lib/reporters/WebDriver';

import 'dojo/has!host-browser?./lib/reporters/Html';
