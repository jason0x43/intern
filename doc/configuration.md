# Configuration

Each executor can be configured by passing an object of configuration properties to the executor's `initialize` static
method or to its `config` method. The runner scripts (browser or Node-based) also understand a `config` property. When
this property is specified, the runner will load the config and initialize the executor with it.

The config used with Intern's built-in runner scripts is serializable via JSON.parse, so the entire config may be passed
via the command line or as query args.

The executor will validate and normalize any supplied config properties. This means that the property values on the
`config` property on the executor may not correspond exaclty to the values provided via a config file or config object.
For example, several properties such as `suites` and `environments` may be specified as a single string for convenience,
but they will always be arrays on the normalized executor config object.

## Loader

A loader is a script that sets up the environment, loads suites, and runs Intern. See the loader section in the
architecture doc for more details.

The `loader` property can be a string with a loader ID or the path to a loader script. It may also be an object with
`id` and `config` properties. Intern provides built-in loader scripts for Dojo and Dojo2, which can be specified with
the IDs 'dojo' and 'dojo2'.

    loader: 'dojo2'
    loader: 'tests/loader.js'
    loader: { id: 'dojo', config: { packages: [ { name: 'app', location: './js' } ] } }

## Suites

Executors themselves don't load suites; this is handled by one of Intern's built-in loader scripts or by user code. Any
lists of suites contained in the config file must be processed by something outside the executor.

There are several properties that specify suites, depending on the executor:

* Node and Browser
  * `suites` - unit tests suites
  * `benchmarkSuites` - benchmark suites
* WebDriver
  * `suites` - unit test suites that are run in a remote browser
  * `benchmarkSuites` - benchmark suites run in a remote browser
  * `functionalSuites` - suites run locally that drive a remote browser
