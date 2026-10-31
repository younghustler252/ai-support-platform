import type { RequestHandler } from "express";

import { ForbiddenError } from "../errors/app-error.js";

export function requireTrustedOrigin(allowedOrigins: readonly string[]): RequestHandler {
	const allowed = new Set(allowedOrigins);

	return (request, _response, next) => {
		const origin = request.get("origin");
		if (origin !== undefined) {
			next(allowed.has(origin) ? undefined : new ForbiddenError("Untrusted request origin"));
			return;
		}
		if (request.get("sec-fetch-site") === "cross-site") {
			next(new ForbiddenError("Untrusted request origin"));
			return;
		}
		next();
	};
}
