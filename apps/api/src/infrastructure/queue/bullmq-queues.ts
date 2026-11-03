import { Queue } from "bullmq";

import type { AiReplyScheduler } from "../../modules/ai/ai-reply-scheduler.js";
import type { EmailMessage } from "../email/email-transport.js";
import type { EmailQueue } from "../email/in-process-email-queue.js";
import { defaultJobOptions, queueNames, type AiReplyJob, type EmailJob } from "./queue-config.js";
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
