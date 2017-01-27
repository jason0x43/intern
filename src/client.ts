if (location.search) {
	const args: { [key: string]: any } = {};

	location.search.slice(1).split('&').forEach(arg => {
		if (!arg) {
			return;
		}

		const parts = arg.split('=');
		const key = decodeURIComponent(parts[0]);

		if (!key) {
			return;
		}

		// An arg name with no value is treated as having the value 'true'
		const value = decodeURIComponent(parts[1]) || true;

		// Support multiple arguments with the same name
		if (key in args) {
			if (!Array.isArray(args[key])) {
				args[key] = [args[key]];
			}

			args[key].push(value);
		}
		else {
			args[key] = value;
		}
	});

	intern.configure(args);
}
