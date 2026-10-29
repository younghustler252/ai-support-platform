import type { RequestHandler } from "express";
import { z } from "zod";

import { ValidationError } from "../errors/app-error.js";

export function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
	const result = schema.safeParse(value);
	if (result.success) return result.data;

	throw new ValidationError("Request validation failed", {
		issues: result.error.issues.map((issue) => ({
			path: issue.path.map(String).join("."),
			code: issue.code,
			message: issue.message,
		})),
	});
}

export function validateBody<T extends z.ZodType>(schema: T): RequestHandler {
	return (request, response, next) => {
		try {
			response.locals.validatedBody = parseInput(schema, request.body);
			next();
		} catch (error) {
			next(error);
		}
	};
}
