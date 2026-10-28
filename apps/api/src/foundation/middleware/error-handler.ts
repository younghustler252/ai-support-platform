import type { ErrorRequestHandler } from "express";

import { env } from "../../config/env.js";

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
	// Keep internal error details out of API responses.
	console.error("Unhandled API error:", error);

	response.status(500).json({
		error: {
			code: "INTERNAL_SERVER_ERROR",
			message: "An unexpected error occurred.",
			...(env.NODE_ENV === "development" ? { debug: "Check the API server logs." } : {}),
		},
	});
};
