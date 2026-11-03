import { logger } from "../../foundation/logging/logger.js";

export interface AiReplyJobData {
	applicationId: string;
	conversationId: string;
	messageId: string;
}

export interface AiReplyScheduler {
	schedule(job: AiReplyJobData): Promise<void>;
	close?(): Promise<void>;
}

export class NoopAiReplyScheduler implements AiReplyScheduler {
	async schedule(): Promise<void> {}
}

export async function scheduleSafely(scheduler: AiReplyScheduler, job: AiReplyJobData): Promise<void> {
	try {
		await scheduler.schedule(job);
	} catch (error) {
		logger.warn("ai.schedule_failed", { conversationId: job.conversationId, error });
	}
}
