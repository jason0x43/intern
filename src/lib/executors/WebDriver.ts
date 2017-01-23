import Executor, { Events as BaseEvents } from './Executor';
import Tunnel from 'digdug/Tunnel';

export interface TunnelMessage {
	tunnel: Tunnel;
	progress?: any;
	status?: string;
}

export interface Events extends BaseEvents {
	tunnelDownloadProgress: TunnelMessage;
	tunnelStatus: TunnelMessage;
};

export default class WebDriver extends Executor {
}
