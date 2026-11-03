import type { ConnectionOptions, DefaultJobOptions } from "bullmq";

import { env } from "../../config/env.js";
import type { EmailMessage } from "../email/email-transport.js";

export const queueNames = { email: "email", ai: "ai" } as const;

export interface EmailJob {
	message: EmailMessage;
}

export interface AiReplyJob {
	applicationId: string;
	conversationId: string;
	messageId: string;
}

export const defaultJobOptions: DefaultJobOptions = {
	attempts: 5,
	backoff: { type: "exponential", delay: 2000 },
	removeOnComplete: { age: 3600, count: 1000 },
	removeOnFail: { age: 7 * 24 * 3600 },
};

export function redisConnectionOptions(url: string | undefined = env.REDIS_URL): ConnectionOptions | null {
	if (!url) return null;
	const parsed = new URL(url);
	const database = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;
	return {
		host: parsed.hostname,
		port: parsed.port ? Number(parsed.port) : 6379,
		...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
		...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
		...(Number.isInteger(database) && database > 0 ? { db: database } : {}),
		...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
	};
}
