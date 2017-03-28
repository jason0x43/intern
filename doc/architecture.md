# Architecture

## Components

Intern has several major components:

* Executors
* Reporters
* Runners
* Loaders
* Interfaces
* Assertions

### Executors

Executors are the core of Intern. They manage the testing process, including emitting events for test lifecycle
events.

### Reporters

Reporters are how Intern displays or outputs test results and coverage information. Since Intern is an event emitter,
anything that registers for Intern events can be a "reporter". Classes that inherit from Reporter gain a few
conveniences. Reporter also exports a decorator that handles some of the event registration boilerplate.

### Runners

A runner is a script that instantiates an executor, configures it, and starts the testing process.

Intern includes 2 runners:

* The Node CLI runner in `bin/intern` - This is used to run Node and WebDriver tests
* The remote runner in `browser/remote.html` - This is used to run WebDriver tests in remote browsers

### Loaders

A loader is an optional script that is used by Intern's runner scripts to set up the environment for testing,
including configuring a module loader (if necessary) and loading suites. If a loader isn't used, Intern's runner scripts
will use an environment-specific default method for loading suites in a provided suites list. In a Node environment
`require` will be used, while the browser runner will use script injection. If a user creates a fully custom runner
script, a loader script will not be required.

### Interfaces

An interface is a particular style of suite and test declaration. Intern comes with 4 built-in interfaces.

#### Object

This is the default interface used for Intern's self-tests and most examples. A suite is a simple object, and tests are
functions in a `tests` property on that object.

```ts
registerSuite({
    name: 'Component',

    tests: {
        create() {
            // ...
        },

        update() {
            // ...
        }
    }
})
```

#### TDD

```ts
suite('Component', () => {
    test('create', () => {
        // ...
    });

    test('update', () => {
        // ...
    });
});
```

#### BDD

```ts
describe('Component', () => {
    it('should not throw when created', () => {
        // ...
    });

    it('should render updated values', () => {
        // ...
    });
});
```

#### Qunit

```ts
QUnit.module('Component');
QUnit.test('create', () => {
    // ...
});
QUnit.test('update', () => {
    // ...
});
```

### Assertions

An assertion is simply a check that throws an error if the check fails. This means that no special library is required
to make assertions. However, assertion libraries can make tests easier to understand, and can automatically generate
meanful failure messages. To that end, Intern includes the Chai assertion library, and exposes its 3 interface (“assert”,
“expect”, and “should”) using the `getInterface` method.

```ts
const assert = intern.getInterface('assert');
assert.lengthOf(someArray, 2);
```

## Extension points

Several components can be extended by registering new implementations:

* Reporters
* Interfaces
* Assertions

In each case, Intern has a `registerX` method (e.g., `registerInterface`) that takes a name and some type-specific
item. For example, reporter classes can be registered using the reporter constructor:

```ts
intern.registerReporter('custom', Custom);
```

Intern configs may then use the 'custom' reporter.
