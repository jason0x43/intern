import request from 'dojo-core/request/xhr';

export default class Channel {
	readonly sessionId: string;

	readonly url: string;

	protected _activeRequest: Promise<any>;
	protected _pendingRequest: Promise<any>;
	protected _messageBuffer: string[];
	protected _sequence: number;
	protected _maxPostSize: number;

	constructor(options: ChannelOptions) {
		this.sessionId = options.sessionId;
		this.url = options.url;
		this._sequence = 0;
		this._messageBuffer = [];
	}

	/**
	 * Send a message, or schedule it to be sent. Return a promise that resolves when the message has been sent.
	 */
	sendMessage(name: string, data: any) {
		if (data instanceof Error) {
			data = { name: data.name, message: data.message, stack: data.stack };
		}

		return this._sendData(name, data);
	}

	protected _sendData(name: string, data: any) {
		this._messageBuffer.push(JSON.stringify({
			sequence: this._sequence,
			// Although sessionId may be passed as part of the payload, it is passed in the message object as well to
			// allow the conduit to be fully separate and encapsulated from the rest of the code
			sessionId: this.sessionId,
			payload: [name, data]
		}));

		// The sequence must not be incremented until after the data is successfully serialised, since an error during
		// serialisation might occur, which would mean the request is never sent, which would mean the dispatcher on the
		// server-side will stall because the sequence numbering will be wrong
		this._sequence++;

		if (this._activeRequest || this._pendingRequest) {
			if (!this._pendingRequest) {
				// Schedule another request after the active one completes
				this._pendingRequest = this._activeRequest.then(() => {
					this._pendingRequest = null;
					return this._send();
				});
			}
			return this._pendingRequest;
		}

		return this._send();
	}

	/**
	 * Send all buffered messages and empty the buffer. Note that the posted data will always be an array of objects.
	 */
	protected _send() {
		// Some testing services have problems handling large message POSTs, so limit the maximum size of
		// each POST body to maxPostSize bytes. Always send at least one message, even if it's more than
		// maxPostSize bytes.
		const sendNextBlock = (): Promise<any> => {
			const block = [ messages.shift() ];
			let size = block[0].length;
			while (messages.length > 0 && size + messages[0].length < exports.maxPostSize) {
				size += messages[0].length;
				block.push(messages.shift());
			}

			return request(this.url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				data: JSON.stringify(block)
			}).then(() => {
				if (messages.length > 0) {
					return sendNextBlock();
				}
			});
		};

		const messages = this._messageBuffer;
		this._messageBuffer = [];

		this._activeRequest = new Promise((resolve, reject) => {
			return sendNextBlock().then(
				() => {
					this._activeRequest = null;
					resolve();
				},
				error => {
					this._activeRequest = null;
					reject(error);
				}
			);
		});

		return this._activeRequest;
	}
}

export function isChannel(value: any): value is Channel {
	return value && typeof value === 'object' && typeof value.sendMessage === 'function';
}

export interface ChannelOptions {
	sessionId: string;
	url: string;
}
