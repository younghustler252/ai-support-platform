import type { RequestHandler } from "express";
import { TooManyRequestsError } from "../../../foundation/errors/app-error.js";

interface Counter { count: number; expiresAt: number }
const counters = new Map<string, Counter>();

// Development / single-process protection. Replace with shared Redis limits
// before horizontally scaling or exposing public authentication traffic.
export function authRateLimit(limit: number, windowMs: number): RequestHandler {
	return (request, _response, next) => {
		const now = Date.now();
		if (counters.size > 10000) {
			for (const [key, entry] of counters) {
				if (entry.expiresAt <= now) counters.delete(key);
			}
		}
		const key = `${request.ip ?? "unknown"}:${request.path}`;
		const previous = counters.get(key);
		const current = !previous || previous.expiresAt <= now
			? { count: 1, expiresAt: now + windowMs }
			: { count: previous.count + 1, expiresAt: previous.expiresAt };
		counters.set(key, current);
		if (current.count > limit) {
			next(new TooManyRequestsError("Please wait before trying again"));
			return;
		}
		next();
	};
}
