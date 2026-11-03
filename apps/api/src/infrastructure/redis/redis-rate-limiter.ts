import type { Redis } from "ioredis";

import { logger } from "../../foundation/logging/logger.js";
import { MemoryRateLimiter, type RateLimiter, type RateLimitResult } from "../../foundation/rate-limit/rate-limiter.js";
import { createRedis } from "./redis-client.js";

const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}
`;

export class RedisRateLimiter implements RateLimiter {
	constructor(
		private readonly redis: Pick<Redis, "eval">,
		private readonly fallback: RateLimiter = new MemoryRateLimiter(),
	) {}

	async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
		try {
			const [count, ttl] = (await this.redis.eval(script, 1, `rl:${key}`, String(windowMs))) as [number, number];
			const allowed = count <= limit;
			return { allowed, remaining: Math.max(0, limit - count), retryAfterMs: allowed ? 0 : Math.max(0, ttl) };
		} catch (error) {
			logger.warn("rate_limit.redis_unavailable", { error });
			return this.fallback.consume(key, limit, windowMs);
		}
	}
}

export function createRateLimiter(): RateLimiter {
	const redis = createRedis({ enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: 500 });
	return redis ? new RedisRateLimiter(redis) : new MemoryRateLimiter();
}
