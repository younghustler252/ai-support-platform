import express from "express";
import cors from "cors";
import helmet from "helmet";

import { corsOrigins, trustProxy } from "./config/env.js";
import { container } from "./container/index.js";
import { apiRouter } from "./routes/index.js";
import { NotFoundError } from "./foundation/errors/app-error.js";
import { errorHandler } from "./foundation/middleware/error-handler.js";
import { requestScope } from "./foundation/middleware/request-scope.js";
import { logger } from "./foundation/logging/logger.js";
import type { PrismaClient } from "./generated/prisma/client.js";

export function createApp() {
	const app = express();

	app.set("trust proxy", trustProxy);
	app.disable("x-powered-by");
	app.use(helmet());
	app.use(
		cors({
			origin: [...corsOrigins],
			credentials: true,
			exposedHeaders: ["X-Request-Id", "Retry-After"],
			maxAge: 600,
		}),
	);
	app.use(requestScope(container));
	app.use(express.json({ limit: "64kb" }));

	app.get("/health", (_request, response) => {
		response.json({ status: "ok" });
	});

	app.get("/ready", async (_request, response) => {
		try {
			const database = container.resolve<PrismaClient>("prisma");
			await database.$queryRaw`SELECT 1`;

			response.json({
				status: "ready",
				database: "connected",
			});
		} catch (error) {
			logger.error("database.readiness_failed", { error });
			response.status(503).json({
				status: "not_ready",
				database: "unavailable",
			});
		}
	});

	app.use("/api/v1", apiRouter(container));

	app.use((_request, _response, next) => {
		next(new NotFoundError("Route not found"));
	});

	app.use(errorHandler);

	return app;
}
