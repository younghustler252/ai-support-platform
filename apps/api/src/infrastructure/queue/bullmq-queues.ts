import { Queue } from "bullmq";

import type { AiReplyScheduler } from "../../modules/ai/ai-reply-scheduler.js";
import type { EmailMessage } from "../email/email-transport.js";
import type { EmailQueue } from "../email/in-process-email-queue.js";
import type { WebhookQueue } from "../../modules/webhooks/webhook-queue.js";
import { tenancyConfig } from "../../config/tenancy.js";
import { defaultJobOptions, queueNames, type AiReplyJob, type EmailJob, type WebhookJob } from "./queue-config.js";
import type { ConnectionOptions } from "bullmq";

export class BullMqEmailQueue implements EmailQueue {
	private readonly queue: Queue<EmailJob>;

	constructor(connection: ConnectionOptions) {
		this.queue = new Queue<EmailJob>(queueNames.email, { connection, defaultJobOptions });
	}

	async enqueue(message: EmailMessage): Promise<void> {
		await this.queue.add("send", { message });
	}

	async drain(): Promise<void> {
		await this.queue.close();
	}
}

export class BullMqAiReplyScheduler implements AiReplyScheduler {
	private readonly queue: Queue<AiReplyJob>;

	constructor(connection: ConnectionOptions) {
		this.queue = new Queue<AiReplyJob>(queueNames.ai, { connection, defaultJobOptions });
	}

	async schedule(job: AiReplyJob): Promise<void> {
		await this.queue.add("reply", job, { jobId: `ai-reply-${job.messageId}` });
	}

	async close(): Promise<void> {
		await this.queue.close();
	}
}

export class BullMqWebhookQueue implements WebhookQueue {
	private readonly queue: Queue<WebhookJob>;

	constructor(connection: ConnectionOptions) {
		this.queue = new Queue<WebhookJob>(queueNames.webhooks, {
			connection,
			defaultJobOptions: { ...defaultJobOptions, attempts: tenancyConfig.webhooks.attempts, backoff: { type: "exponential", delay: 10_000 } },
		});
	}

	async enqueue(deliveryId: string): Promise<void> {
		await this.queue.add("deliver", { deliveryId }, { jobId: `webhook-${deliveryId}-${Date.now()}` });
	}

	async close(): Promise<void> {
		await this.queue.close();
	}
}
