import type { Request, RequestHandler, Response } from "express";
import type { AwilixContainer } from "awilix";

import { TooManyRequestsError } from "../errors/app-error.js";
import type { RateLimiter } from "../rate-limit/rate-limiter.js";

export interface RateLimitRule {
	name: string;
	limit: number;
	windowMs: number;
	key: (request: Request, response: Response) => string | null;
}

export function rateLimit(...rules: RateLimitRule[]): RequestHandler {
	return async (request, response, next) => {
		const limiter = (response.locals.scope as AwilixContainer).resolve<RateLimiter>("rateLimiter");
		let retryAfterMs = 0;

		for (const rule of rules) {
			const key = rule.key(request, response);
			if (!key) continue;
			const result = await limiter.consume(`${rule.name}:${key}`, rule.limit, rule.windowMs);
			if (!result.allowed) retryAfterMs = Math.max(retryAfterMs, result.retryAfterMs);
		}

		if (retryAfterMs > 0) {
			response.setHeader("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
			throw new TooManyRequestsError("Too many attempts. Please try again later.");
		}
		next();
	};
}

export function clientIp(request: Request): string {
	return request.ip ?? "unknown";
}
