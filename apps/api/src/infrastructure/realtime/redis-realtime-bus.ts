import type { Redis } from "ioredis";

import { logger } from "../../foundation/logging/logger.js";
import { createRedis } from "../redis/redis-client.js";
import { InProcessRealtimeBus, type RealtimeBus, type RealtimeListener, type Unsubscribe } from "./realtime-bus.js";

export class RedisRealtimeBus implements RealtimeBus {
	private readonly listeners = new Map<string, Set<RealtimeListener>>();

	constructor(
		private readonly publisher: Redis,
		private readonly subscriber: Redis,
	) {
		subscriber.on("message", (channel, message) => {
			let payload: unknown;
			try {
				payload = JSON.parse(message);
			} catch {
				return;
			}
			for (const listener of [...(this.listeners.get(channel) ?? [])]) listener(payload);
		});
	}

	async publish(channel: string, payload: unknown): Promise<void> {
		await this.publisher.publish(channel, JSON.stringify(payload));
	}

	async subscribe(channel: string, listener: RealtimeListener): Promise<Unsubscribe> {
		let set = this.listeners.get(channel);
		if (!set) {
			set = new Set();
			this.listeners.set(channel, set);
			await this.subscriber.subscribe(channel);
		}
		set.add(listener);
		return async () => {
			const current = this.listeners.get(channel);
			if (!current) return;
			current.delete(listener);
			if (current.size === 0) {
				this.listeners.delete(channel);
				await this.subscriber.unsubscribe(channel).catch((error: unknown) => {
					logger.warn("realtime.unsubscribe_failed", { error });
				});
			}
		};
	}

	async close(): Promise<void> {
		this.listeners.clear();
		this.publisher.disconnect();
		this.subscriber.disconnect();
	}
}

export function createRealtimeBus(): RealtimeBus {
	const publisher = createRedis();
	const subscriber = createRedis();
	if (!publisher || !subscriber) return new InProcessRealtimeBus();
	return new RedisRealtimeBus(publisher, subscriber);
}
