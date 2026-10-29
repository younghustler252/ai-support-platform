import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { test } from "node:test";
import express, { type Express } from "express";
import { createContainer, InjectionMode, type AwilixContainer } from "awilix";
import { z } from "zod";

import { requestScope } from "../src/foundation/middleware/request-scope.js";
import { errorHandler } from "../src/foundation/middleware/error-handler.js";
import { AuthenticationError, ForbiddenError } from "../src/foundation/errors/app-error.js";
import { validateBody, validateParams, validateQuery } from "../src/foundation/validation/validate.js";
import type { RequestContext } from "../src/foundation/context/request-context.js";
import { Logger } from "../src/foundation/logging/logger.js";

async function withServer(app: Express, run: (baseUrl: string) => Promise<void>): Promise<void> {
	const server: Server = createServer(app);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

	try {
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("No TCP port");
		await run(`http://127.0.0.1:${address.port}`);
	} finally {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => error ? reject(error) : resolve());
		});
	}
}

function testApp(): { app: Express; container: AwilixContainer } {
	const app = express();
	const container = createContainer({ injectionMode: InjectionMode.PROXY, strict: true });
	app.use(express.json());
	app.use(requestScope(container));
	return { app, container };
}

test("parallel HTTP requests receive distinct scopes and contexts", async () => {
	const { app } = testApp();
	app.get("/context", async (_request, response) => {
		const scope = response.locals.scope as AwilixContainer;
		const context = scope.resolve<RequestContext>("requestContext");
		await new Promise((resolve) => setTimeout(resolve, 15));
		response.json({
			requestId: context.requestId,
			sameContext: context === response.locals.requestContext,
		});
	});
	app.use(errorHandler);

	await withServer(app, async (baseUrl) => {
		const [first, second] = await Promise.all([
			fetch(`${baseUrl}/context`),
			fetch(`${baseUrl}/context`),
		]);
		const a = await first.json() as { requestId: string; sameContext: boolean };
		const b = await second.json() as { requestId: string; sameContext: boolean };

		assert.equal(first.status, 200);
		assert.equal(second.status, 200);
		assert.equal(a.sameContext, true);
		assert.equal(b.sameContext, true);
		assert.notEqual(a.requestId, b.requestId);
		assert.equal(first.headers.get("x-request-id"), a.requestId);
		assert.equal(second.headers.get("x-request-id"), b.requestId);
	});
});

test("body, params and query validation return typed values", async () => {
	const { app } = testApp();
	app.post(
		"/items/:id",
		validateParams(z.object({ id: z.coerce.number().int().positive() })),
		validateQuery(z.object({ page: z.coerce.number().int().positive() })),
		validateBody(z.object({ name: z.string().min(2) })),
		(_request, response) => {
			response.json({
				params: response.locals.validatedParams,
				query: response.locals.validatedQuery,
				body: response.locals.validatedBody,
			});
		},
	);
	app.use(errorHandler);

	await withServer(app, async (baseUrl) => {
		const valid = await fetch(`${baseUrl}/items/12?page=3`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Desk" }),
		});
		assert.equal(valid.status, 200);
		assert.deepEqual(await valid.json(), {
			params: { id: 12 },
			query: { page: 3 },
			body: { name: "Desk" },
		});

		for (const path of ["/items/nope?page=3", "/items/12?page=bad"]) {
			const invalid = await fetch(`${baseUrl}${path}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Desk" }),
			});
			assert.equal(invalid.status, 400);
			const payload = await invalid.json() as { error: { code: string; details: { issues: unknown[] } } };
			assert.equal(payload.error.code, "VALIDATION_ERROR");
			assert.ok(payload.error.details.issues.length > 0);
		}
	});
});

test("error handler maps expected errors and hides unexpected details", async () => {
	const { app } = testApp();
	app.get("/auth", () => { throw new AuthenticationError(); });
	app.get("/forbidden", () => { throw new ForbiddenError(); });
	app.get("/crash", () => { throw new Error("sensitive internal failure"); });
	app.use(errorHandler);

	await withServer(app, async (baseUrl) => {
		for (const [path, status, code] of [
			["/auth", 401, "UNAUTHENTICATED"],
			["/forbidden", 403, "FORBIDDEN"],
			["/crash", 500, "INTERNAL_SERVER_ERROR"],
		] as const) {
			const response = await fetch(`${baseUrl}${path}`);
			const raw = await response.text();
			const payload = JSON.parse(raw) as { error: { code: string; requestId: string } };
			assert.equal(response.status, status);
			assert.equal(payload.error.code, code);
			assert.equal(payload.error.requestId, response.headers.get("x-request-id"));
			assert.doesNotMatch(raw, /sensitive internal failure/);
		}
	});
});

test("structured logger redacts nested secrets and retains request correlation", () => {
	const output: string[] = [];
	const original = console.log;
	console.log = (message: string) => { output.push(message); };

	try {
		new Logger({ requestId: "test-request" }).info("test.event", {
			authorization: "Bearer private",
			profile: { password: "secret", api_key: "private", safe: "visible" },
		});
	} finally {
		console.log = original;
	}

	assert.equal(output.length, 1);
	const entry = JSON.parse(output[0]!) as {
		requestId: string;
		level: string;
		profile: { password: string; api_key: string; safe: string };
		authorization: string;
	};
	assert.equal(entry.requestId, "test-request");
	assert.equal(entry.level, "info");
	assert.equal(entry.authorization, "[REDACTED]");
	assert.equal(entry.profile.password, "[REDACTED]");
	assert.equal(entry.profile.api_key, "[REDACTED]");
	assert.equal(entry.profile.safe, "visible");
});
