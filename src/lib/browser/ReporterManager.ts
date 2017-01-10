import BaseReporterManager, { ReporterConfig, ReporterConstructor } from '../ReporterManager';
import { defineLazyProperty } from '../util';

export default class ReporterManager extends BaseReporterManager {
	/**
	 * Add a reporter to the list of managed reporters.
	 */
	add(Reporter: (ReporterConstructor | Object), config?: ReporterConfig) {
		defineLazyProperty(config, 'output', function () {
			const element = document.createElement('pre');

			return {
				write: function (chunk: string, _encoding: string, callback: Function) {
					element.appendChild(document.createTextNode(chunk));
					callback();
				},
				end: function (chunk: string, _encoding: string, callback: Function) {
					element.appendChild(document.createTextNode(chunk));
					document.body.appendChild(element);
					callback();
				}
			};
		});

		return super.add(Reporter, config);
	}
}
