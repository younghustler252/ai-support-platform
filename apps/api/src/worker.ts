import { UnrecoverableError, Worker } from "bullmq";

import { container } from "./container/index.js";
import { logger } from "./foundation/logging/logger.js";
import { ConflictError, NotFoundError } from "./foundation/errors/app-error.js";
import { prisma } from "./infrastructure/database/prisma.js";
import { EmailDeliveryError, type EmailTransport } from "./infrastructure/email/email-transport.js";
import { queueNames, redisConnectionOptions, type AiReplyJob, type EmailJob } from "./infrastructure/queue/queue-config.js";
import type { GenerateAiReplyUseCase } from "./modules/ai/usecases/generate-ai-reply.usecase.js";

const connection = redisConnectionOptions();
if (!connection) {
	logger.error("worker.redis_not_configured");
	process.exit(1);
}

const emailWorker = new Worker<EmailJob>(
	queueNames.email,
	async (job) => {
		try {
			await container.resolve<EmailTransport>("emailTransport").deliver(job.data.message);
		} catch (error) {
			if (error instanceof EmailDeliveryError && !error.retryable) throw new UnrecoverableError(error.message);
			throw error;
		}
	},
	{ connection, concurrency: 4 },
);

const aiWorker = new Worker<AiReplyJob>(
	queueNames.ai,
	async (job) => {
		const scope = container.createScope();
		try {
			const result = await scope
				.resolve<GenerateAiReplyUseCase>("generateAiReplyUseCase")
				.execute({ applicationId: job.data.applicationId, conversationId: job.data.conversationId });
			logger.info("ai.reply_job_done", { conversationId: job.data.conversationId, outcome: result.outcome });
		} catch (error) {
			if (error instanceof ConflictError || error instanceof NotFoundError) {
				logger.info("ai.reply_job_skipped", { conversationId: job.data.conversationId, reason: error.message });
				return;
			}
			throw error;
		} finally {
			await scope.dispose();
		}
	},
	{ connection, concurrency: 5 },
);

for (const [name, worker] of [["email", emailWorker], ["ai", aiWorker]] as const) {
	worker.on("failed", (job, error) => {
		logger.warn("worker.job_failed", { queue: name, jobId: job?.id, attempts: job?.attemptsMade, error });
	});
	worker.on("error", (error) => {
		logger.error("worker.error", { queue: name, error });
	});
}

logger.info("worker.started");

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;
	logger.info("worker.shutdown_started", { signal });
	const forceExit = setTimeout(() => process.exit(1), 20_000);
	forceExit.unref();
	try {
		await Promise.all([emailWorker.close(), aiWorker.close()]);
		await prisma.$disconnect();
		process.exit(0);
	} catch (error) {
		logger.error("worker.shutdown_failed", { error });
		process.exit(1);
	}
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
