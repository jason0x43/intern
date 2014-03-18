define([ 'sinon/sinon' ], function (sinon) {
	return {
		/**
		 * AMD plugin API interface for easy loading of chai assertion interfaces.
		 */
		load: function (id, parentRequire, callback) {
			require([
				'sinon/sinon/spy',
				'sinon/sinon/call'
			], function () {
				callback(id ? sinon[id] : sinon);
			});
		}
	};
});
