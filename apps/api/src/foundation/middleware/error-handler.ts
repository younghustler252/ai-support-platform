import type { ErrorRequestHandler } from "express";

import { AppError, type ErrorDetails } from "../errors/app-error.js";
import { logger } from "../logging/logger.js";

interface ErrorView {
	statusCode: number;
	code: string;
	message: string;
	details?: ErrorDetails;
	expected: boolean;
}

function toErrorView(error: unknown): ErrorView {
	if (error instanceof AppError) {
		return {
			statusCode: error.statusCode,
			code: error.code,
			message: error.message,
			details: error.details,
			expected: error.statusCode < 500,
		};
	}

	if (typeof error === "object" && error !== null && "type" in error) {
		switch (error.type) {
			case "entity.parse.failed":
				return { statusCode: 400, code: "VALIDATION_ERROR", message: "Malformed JSON request body", expected: true };
			case "entity.too.large":
				return { statusCode: 413, code: "PAYLOAD_TOO_LARGE", message: "Request body is too large", expected: true };
			case "encoding.unsupported":
			case "charset.unsupported":
				return { statusCode: 415, code: "UNSUPPORTED_MEDIA_TYPE", message: "Unsupported request encoding", expected: true };
			default:
				break;
		}
	}

	return {
		statusCode: 500,
		code: "INTERNAL_SERVER_ERROR",
		message: "An unexpected error occurred.",
		expected: false,
	};
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
	const requestId: string | undefined = response.locals.requestContext?.requestId;
	const view = toErrorView(error);

	if (!view.expected) {
		logger.error("request.unhandled_error", { requestId, error });
	}

	if (response.headersSent) {
		next(error);
		return;
	}

	response.status(view.statusCode).json({
		error: {
			code: view.code,
			message: view.message,
			...(view.details ? { details: view.details } : {}),
			...(requestId ? { requestId } : {}),
		},
	});
};
