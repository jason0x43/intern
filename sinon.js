define([ 'sinon', 'sinon/spy', 'sinon/call' ], function (sinon) {
	return {
		/**
		 * AMD plugin API interface for easy loading of sinon interfaces.
		 */
		load: function (id, parentRequire, callback) {
			callback(id ? sinon[id] : sinon);
		}
	};
});
