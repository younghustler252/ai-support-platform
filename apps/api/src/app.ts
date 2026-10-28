import express from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env.js";
import { container } from "./container/index.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./foundation/middleware/error-handler.js";
import type { PrismaClient } from "./generated/prisma/client.js";

export function createApp() {
	const app = express();

	app.disable("x-powered-by");
	app.use(helmet());
	app.use(
		cors({
			origin: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()),
		}),
	);
	app.use(express.json({ limit: "64kb" }));

	// Liveness: confirms the HTTP process is responding.
	app.get("/health", (_request, response) => {
		response.json({ status: "ok" });
	});

	// Readiness: checks the database, not just the HTTP server.
	app.get("/ready", async (_request, response, next) => {
		try {
			const database = container.resolve<PrismaClient>("prisma");

			await database.$queryRaw`SELECT 1`;

			response.json({
				status: "ready",
				database: "connected",
			});
		} catch (error) {
			next(error);
		}
	});

	app.use("/api/v1", apiRouter(container));

	app.use((_request, response) => {
		response.status(404).json({
			error: {
				code: "NOT_FOUND",
				message: "Route not found",
			},
		});
	});

	app.use(errorHandler);

	return app;
}
