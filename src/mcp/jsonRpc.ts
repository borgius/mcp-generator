import { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';

import type { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse } from './types';

export class JsonRpcError extends Error {
	public readonly code: number;
	public readonly data: unknown;

	constructor(message: string, code: number, data?: unknown) {
		super(message);
		this.name = 'JsonRpcError';
		this.code = code;
		this.data = data;
	}
}

type Pending = {
	resolve: (value: unknown) => void;
	reject: (err: unknown) => void;
};

export type JsonRpcClientOptions = {
	logger?: (message: string) => void;
	framing?: 'content-length' | 'ndjson';
};

/**
 * Minimal JSON-RPC 2.0 client that speaks the MCP stdio transport framing
 * (LSP-style Content-Length headers). Also accepts newline-delimited JSON as fallback.
 */
export class JsonRpcClient extends EventEmitter {
	private readonly input: Readable;
	private readonly output: Writable;
	private readonly logger?: (message: string) => void;
	private readonly framing: 'content-length' | 'ndjson';

	private nextId = 1;
	private readonly pending = new Map<number, Pending>();
	private buffer = Buffer.alloc(0);

	constructor(input: Readable, output: Writable, opts?: JsonRpcClientOptions) {
		super();
		this.input = input;
		this.output = output;
		this.logger = opts?.logger;
		this.framing = opts?.framing ?? 'content-length';
		this.input.on('data', (chunk) => this.onData(chunk as Buffer));
		this.input.on('error', (err) => {
			this.rejectAllPending(err);
			this.emit('error', err);
		});
		this.input.on('close', () => {
			this.rejectAllPending(new Error('JSON-RPC stream closed'));
			this.emit('close');
		});
	}

	public notify(method: string, params?: unknown): void {
		const msg: JsonRpcNotification = { jsonrpc: '2.0', method, params };
		this.writeMessage(msg);
	}

	public request(method: string, params?: unknown): Promise<unknown> {
		const id = this.nextId++;
		const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
		this.writeMessage(msg);
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
		});
	}

	private writeMessage(obj: JsonRpcRequest | JsonRpcNotification): void {
		const json = JSON.stringify(obj);
		if (this.framing === 'ndjson') {
			this.output.write(json + '\n');
		} else {
			const bytes = Buffer.from(json, 'utf8');
			const header = Buffer.from(`Content-Length: ${bytes.length}\r\n\r\n`, 'utf8');
			this.output.write(Buffer.concat([header, bytes]));
		}
		this.logger?.(`--> ${json}`);
	}

	private onData(chunk: Buffer): void {
		this.buffer = Buffer.concat([this.buffer, chunk]);

		// Try Content-Length framing first
		while (true) {
			const headerEndCrlf = this.buffer.indexOf('\r\n\r\n');
			const headerEndLf = this.buffer.indexOf('\n\n');
			let headerEnd = -1;
			let sepLen = 0;
			if (headerEndCrlf !== -1 && (headerEndLf === -1 || headerEndCrlf < headerEndLf)) {
				headerEnd = headerEndCrlf;
				sepLen = 4;
			} else if (headerEndLf !== -1) {
				headerEnd = headerEndLf;
				sepLen = 2;
			}
			if (headerEnd === -1) {
				break;
			}
			const headerRaw = this.buffer.slice(0, headerEnd).toString('utf8');
			const match = /^Content-Length:\s*(\d+)\s*$/im.exec(headerRaw);
			if (!match) {
				break;
			}
			const contentLength = Number(match[1]);
			const totalLen = headerEnd + sepLen + contentLength;
			if (this.buffer.length < totalLen) {
				break;
			}
			const body = this.buffer.slice(headerEnd + sepLen, totalLen).toString('utf8');
			this.buffer = this.buffer.slice(totalLen);
			this.handleJson(body);
		}

		// Fallback: newline delimited JSON (best-effort)
		while (true) {
			const nl = this.buffer.indexOf('\n');
			if (nl === -1) {
				break;
			}
			const line = this.buffer.slice(0, nl).toString('utf8').trim();
			this.buffer = this.buffer.slice(nl + 1);
			if (!line) {
				continue;
			}
			if (line.startsWith('{') && line.endsWith('}')) {
				this.handleJson(line);
			} else {
				// not JSON, ignore
			}
		}
	}

	private handleJson(raw: string): void {
		this.logger?.(`<-- ${raw}`);
		let msg: unknown;
		try {
			msg = JSON.parse(raw);
		} catch (e) {
			this.emit('error', e);
			return;
		}

		const resp = msg as Partial<JsonRpcResponse>;
		if (resp && resp.jsonrpc === '2.0' && resp.id !== undefined) {
			const idNum = typeof resp.id === 'number' ? resp.id : Number.NaN;
			const pending = Number.isFinite(idNum) ? this.pending.get(idNum) : undefined;
			if (pending) {
				this.pending.delete(idNum);
				if (resp.error) {
					pending.reject(new JsonRpcError(resp.error.message, resp.error.code, resp.error.data));
				} else {
					pending.resolve(resp.result);
				}
				return;
			}
		}

		this.emit('message', msg);
	}

	private rejectAllPending(err: unknown): void {
		for (const [, pending] of this.pending) {
			pending.reject(err);
		}
		this.pending.clear();
	}
}
