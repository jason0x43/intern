# Running Intern

There are several ways to run Intern:

* Node runner
* Browser runner
* Custom node script
* Custom HTML page

## Node Runner

The node runner is a built in script for runnnig Node-based unit tests and WebDriver tests. Usage us simple:

    $ node node_modules/.bin/intern config=tests/intern.json

or

    $ node node_modules/.bin/intern webdriver config=tests/intern.json

## Browser Runner

The browser runner is a built in HTML page for running browser-based unit tests. To use, serve the project root
directory using a static webserver and browse to (assuming the server is running on port 8080):

    http://localhost:8080/node_modules/intern/

## Custom Node Script

You may create a custom script to load and run Intern. The basic steps this script must perform are:

1. Load the Node or WebDriver executor module and any reporters that will be used
2. Initialize the executor by calling `<Executor>.initialize`. Configuration information may be passed at this step.
3. Register any reporter classes with `intern.registerReporter`
4. Load suites
5. Call `intern.run`

## Custom HTML Page

This is similar to the custom Node script. The basic steps are (in an HTML page):

1. Load the Browser executor (`node_modules/intern/browser/intern.js`)
2. Configure the executor
3. Load suites
4. Call `intern.run`
