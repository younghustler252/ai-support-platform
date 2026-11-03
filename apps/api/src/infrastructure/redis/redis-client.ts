import { Redis, type RedisOptions } from "ioredis";

import { env } from "../../config/env.js";
import { logger } from "../../foundation/logging/logger.js";

export function createRedis(options: RedisOptions = {}): Redis | null {
	if (!env.REDIS_URL) return null;
	const client = new Redis(env.REDIS_URL, options);
	client.on("error", (error) => {
		logger.warn("redis.error", { error });
	});
	return client;
}
