import Channel, { ChannelOptions } from './Channel';

export default class WebSocketChannel extends Channel {
	protected _socket: WebSocket;
	protected _sendQueue: { [key: number]: () => void };

	constructor(options: WebSocketOptions) {
		super(options);

		// this._socket = new WebSocket(url);
		this._socket = new WebSocket(`ws://localhost:${options.port}`);
		this._socket.addEventListener('message', event => {
			console.log('got message:', event);
			this._handleMessage(JSON.parse(event.data));
		});

		this._sendQueue = {};
	}

	sendMessage(name: string, data: any): Promise<any> {
		try {
			const sequence = this._sequence;
			const message = JSON.stringify({
				sequence,
				// Although sessionId may be passed as part of the payload, it is passed in the message object as well to
				// allow the conduit to be fully separate and encapsulated from the rest of the code
				sessionId: this.sessionId,
				payload: [name, data]
			});

			this._sequence++;

			return new Promise(resolve => {
				this._socket.send(message);
				this._sendQueue[sequence] = resolve;
			});
		}
		catch (error) {
			return Promise.reject(error);
		}
	}

	protected _handleMessage(message: any) {
		const sequence = message.sequence;
		console.log('resolving', this._sendQueue[sequence]);
		this._sendQueue[sequence]();
		this._sendQueue[sequence] = null;
	}
}

export interface WebSocketOptions extends ChannelOptions {
	port: number;
}
