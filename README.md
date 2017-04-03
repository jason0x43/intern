# ![Intern testing framework](https://theintern.github.io/intern/images/readme-logo.png)

[![Build Status](https://travis-ci.org/theintern/intern.svg?branch=master)](https://travis-ci.org/theintern/intern)
[![Average time to resolve an issue](http://isitmaintained.com/badge/resolution/theintern/intern.svg)](http://isitmaintained.com/project/theintern/intern "Average time to resolve an issue")
[![Percentage of issues still open](http://isitmaintained.com/badge/open/theintern/intern.svg)](http://isitmaintained.com/project/theintern/intern "Percentage of issues still open")

Intern is a complete test system for JavaScript designed to help you write and run consistent, high-quality test
cases for your JavaScript libraries and applications. It can be used to test *any* JavaScript code. It can even be used
to test [non-JavaScript Web and mobile apps](https://theintern.github.io/intern/#native-apps), and to run tests written
for [other test systems](https://theintern.github.io/intern/#custom-interfaces).

If you’re into name-dropping, Intern gets used every day by teams at Twitter, Stripe, Mozilla, IBM, Marriott, Philips,
Zenput, Alfresco, Esri, HSBC, ING, Intuit, and more. It’s also the testing framework of choice for
[growing numbers of open-source projects](https://github.com/search?p=2&q=tests+filename%3Aintern.js&ref=searchresults&type=Code&utf8=%E2%9C%93).

## Quick start

1. Install from npm

   ```sh
   $ cd /my/project/root
   $ npm install intern --save-dev
   ```

2. Create an `intern.json` file in your project root.

   ```js
   {
     "suites": "tests/unit/**/*.js"
   }
   ```

3. Verify your configuration works by running the Node.js client and seeing that no errors are output.

   ```sh
   $ node_modules/.bin/intern
   ```

4. Start writing tests! Read [writing tests](docs/writing_tests.md) in the user guide and see the [Intern
   tutorial](https://github.com/theintern/intern-tutorial) to learn more!

## Get help

The best place to ask questions and get answers about Intern is Stack Overflow. Just tag your question with `intern`.
If you have more immediate questions, or just want to chat with other people interested in Intern, there’s an `#intern`
IRC channel on freenode, and a Gitter room at `theintern/intern`.

## More information

* [Architecture](docs/architecture.md)
* [Writing Tests](docs/writing_tests.md)
* [Configuration](docs/configuration.md)
* [Running](docs/running.md)
* [Web site](https://theintern.github.io)
* [Contributing](https://github.com/theintern/intern/blob/master/CONTRIBUTING.md)

## License

Intern is a Dojo Foundation project offered under the [New BSD](LICENSE) license.

© [SitePen, Inc.](http://sitepen.com) and its [contributors](https://github.com/theintern/intern/graphs/contributors)
