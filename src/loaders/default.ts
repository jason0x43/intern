/**
 * A loader script for loading non-module JavaScript suites.
 *
 * Note that loader scripts must be simple scripts, not modules.
 */
intern.registerLoader((config, done) => {
	intern.loadScript(config.suites).then(() => done(), done);
});
