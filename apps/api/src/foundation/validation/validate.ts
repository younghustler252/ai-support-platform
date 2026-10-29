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

function validate<T extends z.ZodType>(
	schema: T,
	source: "body" | "params" | "query",
): RequestHandler {
	return (request, response, next) => {
		try {
			const value = parseInput(schema, request[source]);

			if (source === "body") response.locals.validatedBody = value;
			if (source === "params") response.locals.validatedParams = value;
			if (source === "query") response.locals.validatedQuery = value;

			next();
		} catch (error) {
			next(error);
		}
	};
}

export function validateBody<T extends z.ZodType>(schema: T): RequestHandler {
	return validate(schema, "body");
}

export function validateParams<T extends z.ZodType>(schema: T): RequestHandler {
	return validate(schema, "params");
}

export function validateQuery<T extends z.ZodType>(schema: T): RequestHandler {
	return validate(schema, "query");
}
