import express from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env.js";
import { container } from "./container/index.js";
import { apiRouter } from "./routes/index.js";

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

	app.get("/health", (_request, response) => {
		response.json({ status: "ok" });
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

	return app;
}
