import global from '@dojo/shim/global';

import { getArgs } from '../lib/browser/util';
import { getConfigDescription } from '../lib/common/config';

global.internConfig = {
	getArgs,
	getConfigDescription
};
