import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { openEventStream } from "../src/foundation/http/sse.js";
import { acquireStream } from "../src/foundation/http/sse.js";
import { TooManyRequestsError } from "../src/foundation/errors/app-error.js";
import { InProcessRealtimeBus } from "../src/infrastructure/realtime/realtime-bus.js";
import { RedisRateLimiter } from "../src/infrastructure/redis/redis-rate-limiter.js";
import type { ConversationView, MessageView } from "../src/modules/conversations/conversation.types.js";
import type { IConversationRepository } from "../src/modules/conversations/repositories/conversation.repository.interface.js";
import { EventPublishingConversationRepository } from "../src/modules/conversations/repositories/event-publishing-conversation.repository.js";
import { RealtimeController } from "../src/modules/realtime/controllers/realtime.controller.js";
import { RealtimePublisher } from "../src/modules/realtime/realtime-publisher.js";
import { applicationChannel, conversationChannel } from "../src/modules/realtime/realtime.types.js";
import { applicationGrants } from "../src/modules/tenancy/services/effective-grants.js";
import { withServer } from "./helpers.js";

function conversation(overrides: Partial<ConversationView> = {}): ConversationView {
	return {
		id: "c-1", applicationId: "app-1", subject: null, status: "WAITING_FOR_AGENT", assigneeUserId: null, assignee: null,
		customer: { id: "cu-1", externalId: "e", displayName: null, email: null },
		lastMessageAt: new Date(), resolvedAt: null, closedAt: null, createdAt: new Date(), updatedAt: new Date(), ...overrides,
	};
}

function message(overrides: Partial<MessageView> = {}): MessageView {
	return { id: "m-1", conversationId: "c-1", sender: "AGENT", senderUserId: "a-1", body: "secret", internal: false, metadata: null, createdAt: new Date(), ...overrides };
}

function collect(bus: InProcessRealtimeBus, channel: string): Promise<unknown[]> {
	const received: unknown[] = [];
	void bus.subscribe(channel, (payload) => received.push(payload));
	return Promise.resolve(received);
}

function inner(overrides: Partial<IConversationRepository> = {}): IConversationRepository {
	return {
		list: async () => ({ items: [], nextCursor: null }),
		find: async () => conversation(),
		countOpenForCustomer: async () => 0,
		createWithMessage: async () => ({ conversation: conversation({ status: "AI_ACTIVE" }), message: message({ sender: "CUSTOMER" }) }),
		listMessages: async () => ({ items: [], nextCursor: null }),
		recentMessages: async () => [],
		appendMessage: async () => ({ result: "ok", message: message(), reopened: false, state: { status: "ASSIGNED_TO_AGENT", assigneeUserId: "a-1" } }),
		apply: async () => ({ result: "ok", conversation: conversation({ status: "ASSIGNED_TO_AGENT", assigneeUserId: "a-1" }), changed: true, event: "claimed" }),
		...overrides,
	};
}

function decorated(bus: InProcessRealtimeBus, overrides: Partial<IConversationRepository> = {}) {
	return new EventPublishingConversationRepository({
		conversationRepositoryImpl: inner(overrides),
		realtimePublisher: new RealtimePublisher({ realtimeBus: bus }),
		webhookDispatcher: { conversationEvent: async () => {}, messageEvent: async () => {} },
	});
}

test("the in-process bus delivers to subscribers of a channel only and stops after unsubscribe", async () => {
	const bus = new InProcessRealtimeBus();
	const a: unknown[] = [];
	const b: unknown[] = [];
	const stop = await bus.subscribe("x", (payload) => a.push(payload));
	await bus.subscribe("y", (payload) => b.push(payload));
	await bus.publish("x", { n: 1 });
	await stop();
	await bus.publish("x", { n: 2 });
	assert.deepEqual(a, [{ n: 1 }]);
	assert.deepEqual(b, []);
});

test("agent messages notify agents with detail and customers with ids only, and never leak internal notes", async () => {
	const bus = new InProcessRealtimeBus();
	const agentEvents = await collect(bus, applicationChannel("app-1"));
	const customerEvents = await collect(bus, conversationChannel("c-1"));
	const repo = decorated(bus, {
		appendMessage: async (_a, _c, input) => ({
			result: "ok",
			message: message({ id: input.kind === "agent-note" ? "m-note" : "m-reply", internal: input.kind === "agent-note" }),
			reopened: false,
			state: { status: "ASSIGNED_TO_AGENT", assigneeUserId: "a-1" },
		}),
	});
	await repo.appendMessage("app-1", "c-1", { kind: "agent-reply", body: "hi" });
	await repo.appendMessage("app-1", "c-1", { kind: "agent-note", body: "private" });

	assert.equal(agentEvents.length, 2);
	assert.deepEqual(customerEvents, [{ type: "message.created", conversationId: "c-1", messageId: "m-reply" }]);
	assert.ok(!JSON.stringify(customerEvents).includes("secret"));
	assert.ok(!JSON.stringify(customerEvents).includes("a-1"));
});

test("transitions publish only when something changed and customers see status without the assignee", async () => {
	const bus = new InProcessRealtimeBus();
	const agentEvents = await collect(bus, applicationChannel("app-1"));
	const customerEvents = await collect(bus, conversationChannel("c-1"));
	await decorated(bus).apply("app-1", "c-1", { type: "claim", agentId: "a-1" });
	await decorated(bus, { apply: async () => ({ result: "ok", conversation: conversation(), changed: false, event: null }) }).apply("app-1", "c-1", { type: "resolve" });
	await decorated(bus, { apply: async () => ({ result: "invalid", reason: "no" }) }).apply("app-1", "c-1", { type: "resolve" });

	assert.deepEqual(agentEvents, [{ type: "conversation.updated", conversationId: "c-1", status: "ASSIGNED_TO_AGENT", assigneeUserId: "a-1", event: "claimed" }]);
	assert.deepEqual(customerEvents, [{ type: "conversation.updated", conversationId: "c-1", status: "ASSIGNED_TO_AGENT" }]);
});

test("a customer message that reopens a conversation publishes the status change before the message", async () => {
	const bus = new InProcessRealtimeBus();
	const agentEvents = (await collect(bus, applicationChannel("app-1"))) as Array<{ type: string }>;
	const repo = decorated(bus, { appendMessage: async () => ({ result: "ok", message: message({ sender: "CUSTOMER" }), reopened: true, state: { status: "WAITING_FOR_AGENT", assigneeUserId: null } }) });
	await repo.appendMessage("app-1", "c-1", { kind: "customer", body: "again" });
	assert.deepEqual(agentEvents.map((event) => event.type), ["conversation.updated", "message.created"]);
});

test("starting a conversation announces it, and a broken bus never fails the operation", async () => {
	const bus = new InProcessRealtimeBus();
	const agentEvents = (await collect(bus, applicationChannel("app-1"))) as Array<{ type: string }>;
	await decorated(bus).createWithMessage("app-1", { customerId: "cu-1", subject: null, body: "hi" });
	assert.deepEqual(agentEvents.map((event) => event.type), ["conversation.updated", "message.created"]);

	const broken = new EventPublishingConversationRepository({
		conversationRepositoryImpl: inner(),
		realtimePublisher: new RealtimePublisher({ realtimeBus: { publish: async () => { throw new Error("redis down"); }, subscribe: async () => async () => {}, close: async () => {} } }),
		webhookDispatcher: { conversationEvent: async () => {}, messageEvent: async () => {} },
	});
	const result = await broken.apply("app-1", "c-1", { type: "claim", agentId: "a-1" });
	assert.equal(result.result, "ok");
});

test("stream slots are capped per identity and released when closed", () => {
	const releases = [acquireStream("u1", 2), acquireStream("u1", 2)];
	assert.throws(() => acquireStream("u1", 2), TooManyRequestsError);
	releases[0]?.();
	releases[0]?.();
	const again = acquireStream("u1", 2);
	assert.throws(() => acquireStream("u1", 2), TooManyRequestsError);
	again();
	releases[1]?.();
	acquireStream("u1", 1)();
});

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, text: string): Promise<string> {
	const decoder = new TextDecoder();
	let buffer = "";
	while (!buffer.includes(text)) {
		const chunk = await reader.read();
		if (chunk.done) break;
		buffer += decoder.decode(chunk.value);
	}
	return buffer;
}

test("the agent stream delivers events as server-sent events and filters assigned-only agents", async () => {
	const bus = new InProcessRealtimeBus();
	const controller = new RealtimeController({ realtimeBus: bus, conversationRepository: inner() });
	const wide = applicationGrants({ organizationRole: "MEMBER", organizationCustom: [], applicationRole: "MEMBER", applicationCustom: [] });
	const server = express();
	server.get("/wide", (_request, response, next) => {
		response.locals.auth = { user: { id: "agent-1" } };
		response.locals.tenant = { organizationId: "org-1", applicationId: "app-1", grants: wide };
		next();
	}, controller.agentEvents);
	server.get("/narrow", (_request, response, next) => {
		response.locals.auth = { user: { id: "agent-2" } };
		response.locals.tenant = { organizationId: "org-1", applicationId: "app-1", grants: { "conversation.read": "ASSIGNED" } };
		next();
	}, controller.agentEvents);

	await withServer(server, async (baseUrl) => {
		const abort = new AbortController();
		const wideResponse = await fetch(`${baseUrl}/wide`, { signal: abort.signal });
		const narrowResponse = await fetch(`${baseUrl}/narrow`, { signal: abort.signal });
		assert.equal(wideResponse.headers.get("content-type"), "text/event-stream; charset=utf-8");
		assert.match(wideResponse.headers.get("cache-control") ?? "", /no-store/);
		const wideReader = (wideResponse.body as ReadableStream<Uint8Array>).getReader();
		const narrowReader = (narrowResponse.body as ReadableStream<Uint8Array>).getReader();
		await readUntil(wideReader, ": connected");
		await readUntil(narrowReader, ": connected");

		await bus.publish(applicationChannel("app-1"), { type: "conversation.updated", conversationId: "c-9", status: "WAITING_FOR_AGENT", assigneeUserId: null, event: "escalated" });
		await bus.publish(applicationChannel("app-1"), { type: "conversation.updated", conversationId: "c-1", status: "ASSIGNED_TO_AGENT", assigneeUserId: "agent-2", event: "claimed" });

		const wideText = await readUntil(wideReader, '"c-1"');
		assert.ok(wideText.includes("event: conversation.updated"));
		assert.ok(wideText.includes('"c-9"'));

		const narrowText = await readUntil(narrowReader, '"c-1"');
		assert.ok(!narrowText.includes('"c-9"'));
		abort.abort();
	});
});

test("the customer stream checks the conversation belongs to the key's application", async () => {
	const bus = new InProcessRealtimeBus();
	const controller = new RealtimeController({ realtimeBus: bus, conversationRepository: inner({ find: async (applicationId) => (applicationId === "app-1" ? conversation() : null) }) });
	const server = express();
	server.get("/:app/events", (request, response, next) => {
		response.locals.apiKey = { keyId: "k-1", application: { id: request.params.app } };
		response.locals.validatedParams = { conversationId: "c-1" };
		next();
	}, controller.customerEvents);
	server.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
		response.status(404).json({ error: "not found" });
	});

	await withServer(server, async (baseUrl) => {
		assert.equal((await fetch(`${baseUrl}/app-2/events`)).status, 404);
		const abort = new AbortController();
		const own = await fetch(`${baseUrl}/app-1/events`, { signal: abort.signal });
		assert.equal(own.status, 200);
		const reader = (own.body as ReadableStream<Uint8Array>).getReader();
		await readUntil(reader, ": connected");
		await bus.publish(conversationChannel("c-1"), { type: "message.created", conversationId: "c-1", messageId: "m-1" });
		assert.ok((await readUntil(reader, "m-1")).includes("event: message.created"));
		abort.abort();
	});
});

test("the event stream helper writes the headers and closes cleanly", async () => {
	const server = express();
	let closed = false;
	server.get("/", (request, response) => {
		const stream = openEventStream(request, response, 10);
		stream.onClose(() => { closed = true; });
		stream.send("hello", { ok: true });
	});
	await withServer(server, async (baseUrl) => {
		const abort = new AbortController();
		const response = await fetch(baseUrl, { signal: abort.signal });
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		const text = await readUntil(reader, ": ping");
		assert.ok(text.includes('event: hello\ndata: {"ok":true}'));
		abort.abort();
		await new Promise((resolve) => setTimeout(resolve, 50));
		assert.equal(closed, true);
	});
});

test("the Redis rate limiter maps counters to limits and falls back to memory when Redis fails", async () => {
	let calls = 0;
	const limiter = new RedisRateLimiter({ eval: (async () => { calls += 1; return [calls, 4000]; }) as never });
	assert.deepEqual(await limiter.consume("k", 2, 1000), { allowed: true, remaining: 1, retryAfterMs: 0 });
	assert.equal((await limiter.consume("k", 2, 1000)).allowed, true);
	assert.deepEqual(await limiter.consume("k", 2, 1000), { allowed: false, remaining: 0, retryAfterMs: 4000 });

	const failing = new RedisRateLimiter({ eval: (async () => { throw new Error("down"); }) as never });
	assert.equal((await failing.consume("k", 1, 1000)).allowed, true);
	assert.equal((await failing.consume("k", 1, 1000)).allowed, false);
});
