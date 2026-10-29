import type { RequestHandler } from "express";
import type { AwilixContainer } from "awilix";

import { createRequestContext } from "../context/request-context.js";
import { logger } from "../logging/logger.js";

export function requestScope(root: AwilixContainer): RequestHandler {
	return (request, response, next) => {
		const scope = root.createScope();
		const context = createRequestContext();
		const requestLogger = logger.child({ requestId: context.requestId });

		scope.register({
			requestContext: { resolve: () => context },
			requestLogger: { resolve: () => requestLogger },
		});

		response.locals.scope = scope;
		response.locals.requestContext = context;
		response.setHeader("X-Request-Id", context.requestId);

		requestLogger.info("request.started", {
			method: request.method,
			path: request.path,
		});

		let disposed = false;
		const cleanup = () => {
			if (disposed) return;
			disposed = true;
			requestLogger.info("request.finished", {
				method: request.method,
				path: request.path,
				statusCode: response.statusCode,
				durationMs: Date.now() - context.startedAt,
			});
			void scope.dispose().catch((error: unknown) => {
				requestLogger.error("request.scope_dispose_failed", { error });
			});
		};

		response.once("finish", cleanup);
		response.once("close", cleanup);
		next();
	};
}
