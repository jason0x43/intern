# Configuration

Each executor can be configured by passing an object of configuration properties to the executor's `initialize` static method or to its `config` method. The runner scripts (browser or Node-based) also understand a `config` property. Whe this property is specified, the runner will load the config and initialize the executor with it.

## Executor Options

### Common

* bail
* basePath
* baseline
* benchmark
* benchmarkConfig
* benchmarkSuites
* debug
* defaultTimeout
* excludeInstrumentation
* filterErrorStack
* formatter
* grep
* instrumenterOptions
* name
* reporters
* loader
* loaderConfig
* suites

### WebDriver

* capabilities
* contactTimeout
* environmentRetries
* environments
* leaveRemoteOpen
* maxConcurrency
* remoteLoader
* remoteLoaderConfig
* remoteSuites
* runInSync
* serveOnly
* serverPort
* serverUrl
* socketPort
* tunnel
* tunnelOptions

### Browser/Remote

* internBasePAth

### Remote

* runInSync
* sessionId
* socketPort

## Suites

Executors themselves don't load suites; this is handled by one of Intern's built-in runner scripts or by user code. Any
lists of suites contained in the config file must be processed by something outside the executor.

There are several properties that specify suites, depending on the executor:

* Node
  * `suites` - unit test suites
  * `benchmarkSuites` - benchmark suites
* WebDriver
  * `suites` - unit test suites that are run in a remote browser
  * `benchmarkSuites` - benchmark suites run in a remote browser
  * `functionalSuites` - suites run locally that drive a remote browser
* Browser
  * `suites` - unit tests suites
  * `benchmarkSuites` - benchmark suites

## Loaders

A loader is a script that sets up the environment, loads suites, and runs Intern. If a loader isn't used, Intern's
runner scripts will use an environment-specific default method for loading suites in a provided suites list. In a Node
environment `require` will be used, while the browser runner will use script injection.

Loaders are an optional feature. A user can also write a custom runner script that loads an executor and any suites,
then calls `intern.run`.

The config format used by Intern's runner scripts understands several properties related to loaders:

* `loader` - This can be a string with a loader ID or the path to a loader script. It may also be an object with `id`
  and `config` properties. Intern provides built-in loader scripts for Dojo and Dojo2, which can be specified with the
  IDs 'dojo' and 'dojo2'.
