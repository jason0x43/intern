import Channel, { ChannelOptions, Message } from './Channel';

export default class WebSocketChannel extends Channel {
	protected _socket: WebSocket;
	protected _sendQueue: { [key: string]: () => void };
	protected _ready: Promise<any>;

	constructor(options: WebSocketOptions) {
		super(options);

		// this._socket = new WebSocket(url);
		this._socket = new WebSocket(`ws://localhost:${options.port}`);

		this._ready = new Promise(resolve => {
			this._socket.addEventListener('open', resolve);
		});

		this._socket.addEventListener('message', event => {
			this._handleMessage(JSON.parse(event.data));
		});

		this._sendQueue = {};
	}

	protected _sendData(name: string, data: any): Promise<any> {
		try {
			const id = String(this._sequence++);
			const sessionId = this.sessionId;
			const message: Message = { id, sessionId, name, data };

			return this._ready.then(() => {
				return new Promise(resolve => {
					console.log(`sending [${message.id}] ${message.name}`);
					this._socket.send(JSON.stringify(message));
					this._sendQueue[id] = resolve;
				});
			});
		}
		catch (error) {
			return Promise.reject(error);
		}
	}

	protected _handleMessage(message: any) {
		console.log(`handling response for ${message.id}`);
		const id = message.id;
		this._sendQueue[id]();
		this._sendQueue[id] = null;
	}
}

export interface WebSocketOptions extends ChannelOptions {
	port: number;
}
