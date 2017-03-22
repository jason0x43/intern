# Architecture

Intern has several major components:

* Executors
* Reporters
* Runners
* Loaders

## Executors

Executors are the core of Intern. They manage the testing process, including emitting events for test lifecycle
events.

## Reporters

Reporters are how Intern displays or outputs test results and coverage information. Since Intern is an event emitter,
anything that registers for Intern events can be a "reporter". Classes that inherit from Reporter gain a few
conveniences. Reporter also exports a decorator that handles some of the event registration boilerplate.

## Runners

A runner is a script that instantiates an executor, configures it, and starts the testing process.

Intern includes 2 runners:

* The Node CLI runner in `bin/intern` - This is used to run Node and WebDriver tests
* The remote runner in `browser/remote.html` - This is used to run WebDriver tests in remote browsers

## Loaders

A loader is an optional script that is used by Intern's runner scripts to set up the environment for testing,
including configuring a module loader (if necessary) and loading suites. If a loader isn't used, Intern's runner scripts
will use an environment-specific default method for loading suites in a provided suites list. In a Node environment
`require` will be used, while the browser runner will use script injection. If a user creates a fully custom runner
script, a loader script will not be required.
