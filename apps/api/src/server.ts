import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { container } from "./container/index.js";
import { logger } from "./foundation/logging/logger.js";
import type { EmailQueue } from "./infrastructure/email/in-process-email-queue.js";
import { prisma } from "./infrastructure/database/prisma.js";
import { startAuthMaintenance } from "./modules/auth/auth.maintenance.js";

const SHUTDOWN_TIMEOUT_MS = 15_000;
const EMAIL_DRAIN_TIMEOUT_MS = 5_000;

const server = createApp().listen(env.PORT, () => {
	logger.info("server.started", { port: env.PORT });
});
const stopMaintenance = startAuthMaintenance(container);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;
	logger.info("server.shutdown_started", { signal });

	const forceExit = setTimeout(() => {
		logger.error("server.shutdown_forced");
		process.exit(1);
	}, SHUTDOWN_TIMEOUT_MS);
	forceExit.unref();

	try {
		stopMaintenance();
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
			server.closeIdleConnections();
		});
		await container.resolve<EmailQueue>("emailQueue").drain(EMAIL_DRAIN_TIMEOUT_MS);
		await prisma.$disconnect();
		logger.info("server.shutdown_complete");
		process.exit(0);
	} catch (error) {
		logger.error("server.shutdown_failed", { error });
		process.exit(1);
	}
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
	logger.error("process.unhandled_rejection", { error: reason });
});
