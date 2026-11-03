import type { AiReplyScheduler } from "../../modules/ai/ai-reply-scheduler.js";
import { NoopAiReplyScheduler } from "../../modules/ai/ai-reply-scheduler.js";
import type { EmailTransport } from "../email/email-transport.js";
import { InProcessEmailQueue, type EmailQueue } from "../email/in-process-email-queue.js";
import { BullMqAiReplyScheduler, BullMqEmailQueue } from "./bullmq-queues.js";
import { redisConnectionOptions } from "./queue-config.js";

export function createEmailQueue(deps: { emailTransport: EmailTransport }): EmailQueue {
	const connection = redisConnectionOptions();
	return connection ? new BullMqEmailQueue(connection) : new InProcessEmailQueue(deps);
}

export function createAiReplyScheduler(): AiReplyScheduler {
	const connection = redisConnectionOptions();
	return connection ? new BullMqAiReplyScheduler(connection) : new NoopAiReplyScheduler();
}
