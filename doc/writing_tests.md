# Writing Tests

At the most basic level, a test is a function that either runs to completion or throws an error. Intern groups tests
into suites, and runs the suites when `intern.run()` is called.

* [Assertions](#assertions)
* [Interfaces](#interfaces)
* [Organization](#organization)

## Assertions

Tests should throw errors when some feature being tested doesn’t behave as expected. The standard `throw` mechanism will
work for this purpose, but performing a particular test and constructing meaningful error messages can be tedious.
Assertion libraries exist that can simplify this process. Intern bundles the [chai](http://chaijs.com) assertion
library, and exposes its ‘[assert](http://chaijs.com/api/assert/)’, ‘[expect](http://chaijs.com/api/bdd/)’, and ‘[should](http://chaijs.com/api/bdd/)’ interfaces via a `getAssertions` method.

```ts
const assert = intern.getAssertions('assert');
```

## Interfaces

There are several ways to write tests. The most common will be to use one of Intern's built-in interfaces, such as the
object interface. Another possibility is to register tests or suites directly on the Intern object.

Interfaces may be accessed using the `getInterface` method.

### Object

This is the default interface used for Intern's self-tests and most examples. A suite is a simple object, and tests are
functions in a `tests` property on that object.

```ts
const { registerSuite } = intern.getInterface('object');

registerSuite({
    name: 'Component',

    tests: {
        'create new'() {
            assert.doesNotThrow(() => new Component());
        },

        'update values'() {
            const component = new Component();
            component.update({ value: 20 });
            assert.equal(component.children[0].value, 20);
        }
    }
})
```

### TDD

```ts
const { suite, test } = intern.getInterface('tdd');

suite('Component', () => {
    test('create new', () => {
        assert.doesNotThrow(() => new Component());
    });

    test('update values', () => {
        const component = new Component();
        component.update({ value: 20 });
        assert.equal(component.children[0].value, 20);
    });
});
```

### BDD

```ts
const { bdd, it } = intern.getInterface('bdd');

describe('Component', () => {
    it('should not throw when created', () => {
        assert.doesNotThrow(() => new Component());
    });

    it('should render updated values', () => {
        const component = new Component();
        component.update({ value: 20 });
        assert.equal(component.children[0].value, 20);
    });
});
```

### Qunit

```ts
const { QUnit } = intern.getInterface('qunit');

QUnit.module('Component');
QUnit.test('create new', () => {
    assert.doesNotThrow(() => new Component());
});
QUnit.test('update values', () => {
    const component = new Component();
    component.update({ value: 20 });
    assert.equal(component.children[0].value, 20);
});
```

### Native

The native interface is simply the `addTest` method on Executor, which is what the various test interfaces use behind
the scenes to register tests and suites. This method can take a constructed Suite or Test object, or an object of Suite
options or Test options.

```ts
intern.addTest({ name: 'create new', test: () => assert.doesNotThrow(() => new Component()) };
intern.addTest(new Test({
    name: 'update values',
    test: () => {
        const component = new Component();
        component.update({ value: 20 });
        assert.equal(component.children[0].value, 20);
    }
});
```

When tests are added directly, they will be part of the executor's root suite.

## Organization

Suites are typically grouped into script files, with one top-level suite per file. How the files themselves are
structured depends on how the suite files will be [loaded](./architecture.md#loaders). For example, if the ‘dojo’ loader
is used to load suites, an individual suite file would be an AMD module:

```js
define([ 'app/Component' ], function (Component) {
    var assert = intern.getAssertions('assert');
    var registerSuite = intern.getInterface('object').registerSuite;

    registerSuite({
        name: 'Component',
        tests: {
            'create new': function () {
                assert.doesNotThrow(() => new Component());
            }
        }
    });
});
```

On the other hand, if the loader is using SystemJS + Babel to load suites, suite file could be an ESM module:

```ts
const assert = intern.getAssertions('assert');
const { registerSuite } = intern.getInterface('object');

registerSuite({
    name: 'Component',
    tests: {
        'create new'() {
            assert.doesNotThrow(() => new Component());
        }
    }
});
```
