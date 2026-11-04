import type { AiReplyScheduler } from "../../modules/ai/ai-reply-scheduler.js";
import { NoopAiReplyScheduler } from "../../modules/ai/ai-reply-scheduler.js";
import type { EmailTransport } from "../email/email-transport.js";
import { InProcessEmailQueue, type EmailQueue } from "../email/in-process-email-queue.js";
import type { WebhookQueue } from "../../modules/webhooks/webhook-queue.js";
import { BullMqAiReplyScheduler, BullMqEmailQueue, BullMqWebhookQueue } from "./bullmq-queues.js";
import { redisConnectionOptions } from "./queue-config.js";

export function createEmailQueue(deps: { emailTransport: EmailTransport }): EmailQueue {
	const connection = redisConnectionOptions();
	return connection ? new BullMqEmailQueue(connection) : new InProcessEmailQueue(deps);
}

export function createAiReplyScheduler(): AiReplyScheduler {
	const connection = redisConnectionOptions();
	return connection ? new BullMqAiReplyScheduler(connection) : new NoopAiReplyScheduler();
}

export function createWebhookQueue(): WebhookQueue | null {
	const connection = redisConnectionOptions();
	return connection ? new BullMqWebhookQueue(connection) : null;
}
