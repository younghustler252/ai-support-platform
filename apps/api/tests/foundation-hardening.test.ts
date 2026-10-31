import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { asValue, createContainer, InjectionMode } from "awilix";

import { ForbiddenError, TooManyRequestsError } from "../src/foundation/errors/app-error.js";
import { errorHandler } from "../src/foundation/middleware/error-handler.js";
import { rateLimit } from "../src/foundation/middleware/rate-limit.js";
import { requestScope } from "../src/foundation/middleware/request-scope.js";
import { requireTrustedOrigin } from "../src/foundation/middleware/trusted-origin.js";
import { MemoryRateLimiter } from "../src/foundation/rate-limit/rate-limiter.js";
import { InProcessEmailQueue } from "../src/infrastructure/email/in-process-email-queue.js";
import { EmailDeliveryError, type EmailMessage } from "../src/infrastructure/email/email-transport.js";
import { passwordChangedEmail, passwordResetEmail, verificationEmail } from "../src/infrastructure/email/auth-email.templates.js";
import { withServer } from "./helpers.js";

test("memory rate limiter blocks after the limit and recovers when the window passes", async () => {
	let now = 1_000_000;
	const limiter = new MemoryRateLimiter(() => now);

	for (let attempt = 1; attempt <= 3; attempt += 1) {
		assert.equal((await limiter.consume("key", 3, 60_000)).allowed, true);
	}
	const blocked = await limiter.consume("key", 3, 60_000);
	assert.equal(blocked.allowed, false);
	assert.equal(blocked.retryAfterMs, 60_000);
	assert.equal((await limiter.consume("other", 3, 60_000)).allowed, true);

	now += 60_001;
	assert.equal((await limiter.consume("key", 3, 60_000)).allowed, true);
});

test("memory rate limiter never grows past its key budget", async () => {
	const limiter = new MemoryRateLimiter(() => 5, 10);
	for (let index = 0; index < 50; index += 1) await limiter.consume(`key-${index}`, 5, 60_000);
	assert.equal((limiter as unknown as { buckets: Map<string, unknown> }).buckets.size <= 10, true);
});

test("rate limit middleware responds 429 with Retry-After once exceeded", async () => {
	const container = createContainer({ injectionMode: InjectionMode.PROXY, strict: true });
	container.register({ rateLimiter: asValue(new MemoryRateLimiter()) });

	const app = express();
	app.use(requestScope(container));
	app.get(
		"/limited",
		rateLimit({ name: "test", limit: 2, windowMs: 60_000, key: () => "same" }),
		(_request, response) => { response.json({ ok: true }); },
	);
	app.use(errorHandler);

	await withServer(app, async (baseUrl) => {
		assert.equal((await fetch(`${baseUrl}/limited`)).status, 200);
		assert.equal((await fetch(`${baseUrl}/limited`)).status, 200);
		const blocked = await fetch(`${baseUrl}/limited`);
		assert.equal(blocked.status, 429);
		assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
		const payload = await blocked.json() as { error: { code: string } };
		assert.equal(payload.error.code, new TooManyRequestsError().code);
	});
});

test("trusted origin middleware allows listed and absent origins and rejects others", async () => {
	const app = express();
	app.use(requestScope(createContainer({ injectionMode: InjectionMode.PROXY, strict: true })));
	app.post("/guarded", requireTrustedOrigin(["https://app.example.com"]), (_request, response) => {
		response.json({ ok: true });
	});
	app.use(errorHandler);

	await withServer(app, async (baseUrl) => {
		const call = (headers: Record<string, string>) => fetch(`${baseUrl}/guarded`, { method: "POST", headers });

		assert.equal((await call({ Origin: "https://app.example.com" })).status, 200);
		assert.equal((await call({})).status, 200);
		const rejected = await call({ Origin: "https://evil.example.com" });
		assert.equal(rejected.status, 403);
		assert.equal(((await rejected.json()) as { error: { code: string } }).error.code, new ForbiddenError().code);
		assert.equal((await call({ "Sec-Fetch-Site": "cross-site" })).status, 403);
	});
});

test("error handler turns malformed and oversized bodies into 4xx responses", async () => {
	const app = express();
	app.use(requestScope(createContainer({ injectionMode: InjectionMode.PROXY, strict: true })));
	app.use(express.json({ limit: "1kb" }));
	app.post("/echo", (request, response) => { response.json(request.body); });
	app.use(errorHandler);

	await withServer(app, async (baseUrl) => {
		const post = (body: string) => fetch(`${baseUrl}/echo`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body,
		});

		const malformed = await post("{ not json");
		assert.equal(malformed.status, 400);
		assert.equal(((await malformed.json()) as { error: { code: string } }).error.code, "VALIDATION_ERROR");

		const oversized = await post(JSON.stringify({ filler: "x".repeat(4000) }));
		assert.equal(oversized.status, 413);
		assert.equal(((await oversized.json()) as { error: { code: string } }).error.code, "PAYLOAD_TOO_LARGE");
	});
});

function message(to = "person@example.com"): EmailMessage {
	return { to, subject: "Subject", html: "<p>Hi</p>", text: "Hi" };
}

async function settle(condition: () => boolean, timeoutMs = 3000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
}

test("email queue delivers queued messages", async () => {
	const delivered: EmailMessage[] = [];
	const queue = new InProcessEmailQueue({ emailTransport: { deliver: async (item) => { delivered.push(item); } } });

	await queue.enqueue(message("a@example.com"));
	await queue.enqueue(message("b@example.com"));
	await settle(() => delivered.length === 2);

	assert.deepEqual(delivered.map((item) => item.to).sort(), ["a@example.com", "b@example.com"]);
	await queue.drain(500);
});

test("email queue retries retryable failures and then delivers", async () => {
	let attempts = 0;
	const queue = new InProcessEmailQueue({
		emailTransport: {
			deliver: async () => {
				attempts += 1;
				if (attempts === 1) throw new EmailDeliveryError("temporary", true);
			},
		},
	});

	await queue.enqueue(message());
	await settle(() => attempts >= 2, 5000);
	assert.equal(attempts, 2);
	await queue.drain(500);
});

test("email queue does not retry permanent failures", async () => {
	let attempts = 0;
	const queue = new InProcessEmailQueue({
		emailTransport: {
			deliver: async () => {
				attempts += 1;
				throw new EmailDeliveryError("rejected", false);
			},
		},
	});

	await queue.enqueue(message());
	await settle(() => attempts >= 1);
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.equal(attempts, 1);
	await queue.drain(500);
});

test("email queue refuses new work after draining", async () => {
	const queue = new InProcessEmailQueue({ emailTransport: { deliver: async () => {} } });
	await queue.drain(100);
	await assert.rejects(queue.enqueue(message()));
});

test("auth email templates keep tokens in the URL fragment and escape content", () => {
	const verification = verificationEmail("abc_DEF-123");
	assert.match(verification.text, /\/verify-email#token=abc_DEF-123/);
	assert.doesNotMatch(verification.text, /\?token=/);
	assert.match(verification.html, /<a href="[^"]*#token=abc_DEF-123"/);

	const reset = passwordResetEmail("reset-token");
	assert.match(reset.text, /\/reset-password#token=reset-token/);
	assert.match(reset.subject, /password/i);

	const changed = passwordChangedEmail();
	assert.doesNotMatch(changed.html, /href=/);
	assert.ok(changed.text.length > 0);
});
