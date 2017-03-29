# Configuration

Each executor can be configured by passing an object of configuration properties to the executor's `initialize` static
method, its construtor, or to its `config` method. Any config property may also be specified as a command line or query
arg using the format `property=value`. Simply serialize the value to a string (e.g.,
`environments='{"browserName":"chrome"}'`).

The runner scripts (browser or Node-based) also understand a ‘config‘ property, which specifies a JSON config file. When
this property is specified, the runner will load the config file and initialize the executor with it. If the ‘config’
property is not specified, each runner will look for an `intern.json` file in the project root. The config file is
simply a JSON file specifying config properties, for example:

```js
{
  "environments": [
    { "browserName": "chrome" }
  ],
  suites: [ "tests/unit/all.js" ]
}
```

The executor will validate and normalize any supplied config properties. This means that the property values on the
`config` property on the executor may not correspond exaclty to the values provided via a config file or config object.
For example, several properties such as `suites` and `environments` may be specified as a single string for convenience,
but they will always be normalized to a canonical format on the executor config object. For example,
`environments=chrome` will end up as

```js
environments: [ { browserName: 'chrome' } ]
```

on the executor’s config object.

## Loader script

A loader is a script that sets up the environment, loads suites, and runs Intern. See the
[loader](./architecture.md#loaders) section in the architecture doc for more details.

The `loader` property can be a string with a loader name or the path to a loader script. It may also be an object with
`script` and `config` properties. Intern provides built-in loader scripts for Dojo and Dojo2, which can be specified
with the IDs 'dojo' and 'dojo2'.

```ts
loader: 'dojo2'
loader: 'tests/loader.js'
loader: { script: 'dojo', config: { packages: [ { name: 'app', location: './js' } ] } }
```

## Preload script

A preload script is a script that runs before suites are loaded. See the [preload
scripts](./architecture.md#preload-scripts) section in the architecture doc for more details. The `preload` property can
be a single string or an array of strings, where each string is the path to a script file.

## Suites

There are several properties that specify suites, depending on the executor:

* Node and Browser
  * `suites` - unit tests suites
  * `benchmarkSuites` - benchmark suites
* WebDriver
  * `suites` - unit test suites that are run in a remote browser
  * `benchmarkSuites` - benchmark suites run in a remote browser
  * `functionalSuites` - suites run locally that drive a remote browser

In each case, the property value may be given as a single string or an array of strings, where each string is the path
to a script file.

Note that executors themselves don't load suites; this is handled by a loader script (either one of Intern's built-in
scripts or a user-supplied one).
