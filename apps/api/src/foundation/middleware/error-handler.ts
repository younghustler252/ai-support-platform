import type { ErrorRequestHandler } from "express";

import { AppError } from "../errors/app-error.js";
import { logger } from "../logging/logger.js";

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
	const requestId: string | undefined = response.locals.requestContext?.requestId;
	const knownError = error instanceof AppError ? error : null;

	if (!knownError) {
		logger.error("request.unhandled_error", { requestId, error });
	}

	if (response.headersSent) {
		return _next(error);
	}

	response.status(knownError?.statusCode ?? 500).json({
		error: {
			code: knownError?.code ?? "INTERNAL_SERVER_ERROR",
			message: knownError?.message ?? "An unexpected error occurred.",
			...(knownError?.details ? { details: knownError.details } : {}),
			...(requestId ? { requestId } : {}),
		},
	});
};
