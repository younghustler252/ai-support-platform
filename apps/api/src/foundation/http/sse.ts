import type { Request, Response } from "express";

import { TooManyRequestsError } from "../errors/app-error.js";

const HEARTBEAT_MS = 25_000;
const open = new Map<string, number>();

export function acquireStream(key: string, max: number): () => void {
	const current = open.get(key) ?? 0;
	if (current >= max) throw new TooManyRequestsError("Too many open event streams");
	open.set(key, current + 1);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		const remaining = (open.get(key) ?? 1) - 1;
		if (remaining <= 0) open.delete(key);
		else open.set(key, remaining);
	};
}

export interface EventStream {
	send(event: string, data: unknown): void;
	onClose(callback: () => void): void;
}

export function openEventStream(request: Request, response: Response, heartbeatMs: number = HEARTBEAT_MS): EventStream {
	response.status(200);
	response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
	response.setHeader("Cache-Control", "no-store, no-transform");
	response.setHeader("Connection", "keep-alive");
	response.setHeader("X-Accel-Buffering", "no");
	response.flushHeaders();
	response.write("retry: 3000\n: connected\n\n");

	const callbacks: Array<() => void> = [];
	const heartbeat = setInterval(() => response.write(": ping\n\n"), heartbeatMs);
	heartbeat.unref();

	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		clearInterval(heartbeat);
		for (const callback of callbacks) callback();
	};
	request.on("close", close);
	response.on("close", close);

	return {
		send: (event, data) => {
			if (!closed) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
		},
		onClose: (callback) => {
			if (closed) callback();
			else callbacks.push(callback);
		},
	};
}
