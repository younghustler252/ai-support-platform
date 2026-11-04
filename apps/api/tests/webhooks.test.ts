import assert from "node:assert/strict";
import test from "node:test";

import { isPrivateAddress } from "../src/infrastructure/http/safe-http.js";
import { signPayload, urlProblem, verifySignature, webhookEventFor, webhookSecret } from "../src/modules/webhooks/domain/webhook-domain.js";
import { DeliverWebhookUseCase } from "../src/modules/webhooks/usecases/deliver-webhook.usecase.js";
import {
	CreateWebhookUseCase,
	RedeliverWebhookUseCase,
	RotateWebhookSecretUseCase,
	TestWebhookUseCase,
} from "../src/modules/webhooks/usecases/webhook-usecases.js";
import { WebhookDispatcher } from "../src/modules/webhooks/webhook-dispatcher.js";
import type { IWebhookRepository } from "../src/modules/webhooks/repositories/webhook.repository.interface.js";
import type { DeliveryWithEndpoint, WebhookEndpointSecretView } from "../src/modules/webhooks/webhook.types.js";
import { BlockedTargetError } from "../src/infrastructure/http/safe-http.js";
import { tenancyConfig } from "../src/config/tenancy.js";

const app = "11111111-1111-4111-8111-111111111111";
const endpointId = "22222222-2222-4222-8222-222222222222";

function endpoint(overrides: Partial<WebhookEndpointSecretView> = {}): WebhookEndpointSecretView {
	return {
		id: endpointId,
		applicationId: app,
		url: "https://example.com/hook",
		description: null,
		events: ["message.created"],
		enabled: true,
		disabledReason: null,
		consecutiveFailures: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
		secretVersion: 1,
		...overrides,
	};
}

class FakeRepo implements IWebhookRepository {
	endpoints = new Map<string, WebhookEndpointSecretView>();
	deliveries = new Map<string, DeliveryWithEndpoint>();
	attempts: Array<{ status: string; responseStatus: number | null; lastError: string | null }> = [];
	failures = 0;
	successes = 0;
	disabled: string[] = [];
	resets: string[] = [];
	nextId = 1;

	async listEndpoints() {
		return [...this.endpoints.values()];
	}
	async findEndpoint(_app: string, id: string) {
		return this.endpoints.get(id) ?? null;
	}
	async countEndpoints() {
		return this.endpoints.size;
	}
	async createEndpoint(_app: string, input: { url: string; description?: string | null; events: string[] }) {
		const created = endpoint({ id: `ep-${this.nextId++}`, url: input.url, events: input.events, description: input.description ?? null });
		this.endpoints.set(created.id, created);
		return created;
	}
	async updateEndpoint(_app: string, id: string, patch: Partial<WebhookEndpointSecretView>) {
		const current = this.endpoints.get(id);
		if (!current) return null;
		const updated = { ...current, ...patch };
		this.endpoints.set(id, updated);
		return updated;
	}
	async rotateSecret(_app: string, id: string) {
		const current = this.endpoints.get(id);
		if (!current) return null;
		const updated = { ...current, secretVersion: current.secretVersion + 1 };
		this.endpoints.set(id, updated);
		return updated;
	}
	async deleteEndpoint(_app: string, id: string) {
		return this.endpoints.delete(id);
	}
	async findSubscribed(_app: string, eventType: string) {
		return [...this.endpoints.values()].filter((item) => item.enabled && item.events.includes(eventType)).map((item) => ({ id: item.id }));
	}
	async createDelivery(input: { endpointId: string; applicationId: string; eventType: string; payload: unknown }) {
		const current = this.endpoints.get(input.endpointId) as WebhookEndpointSecretView;
		const delivery: DeliveryWithEndpoint = {
			id: `d-${this.nextId++}`,
			endpointId: input.endpointId,
			applicationId: input.applicationId,
			eventType: input.eventType,
			status: "PENDING",
			attempts: 0,
			responseStatus: null,
			lastError: null,
			createdAt: new Date(),
			deliveredAt: null,
			payload: input.payload,
			endpoint: { id: current.id, url: current.url, enabled: current.enabled, secretVersion: current.secretVersion },
		};
		this.deliveries.set(delivery.id, delivery);
		return delivery;
	}
	async findDelivery(id: string) {
		return this.deliveries.get(id) ?? null;
	}
	async findDeliveryForApplication(_app: string, _endpoint: string, id: string) {
		return this.deliveries.get(id) ?? null;
	}
	async listDeliveries() {
		return { items: [...this.deliveries.values()], nextCursor: null };
	}
	async recordAttempt(_id: string, result: { status: string; responseStatus: number | null; lastError: string | null }) {
		this.attempts.push(result);
	}
	async resetDelivery(id: string) {
		this.resets.push(id);
	}
	async recordEndpointSuccess() {
		this.successes += 1;
	}
	async recordEndpointFailure() {
		this.failures += 1;
		return this.failures;
	}
	async disableEndpoint(id: string) {
		this.disabled.push(id);
	}
}

async function seeded(options: { enabled?: boolean } = {}) {
	const repo = new FakeRepo();
	repo.endpoints.set(endpointId, endpoint({ enabled: options.enabled ?? true }));
	const delivery = await repo.createDelivery({ endpointId, applicationId: app, eventType: "message.created", payload: { hello: "world" } });
	return { repo, delivery };
}

function deliverer(repo: FakeRepo, post: (url: string, options: { headers: Record<string, string>; body: string }) => Promise<{ status: number }>) {
	return new DeliverWebhookUseCase({ webhookRepository: repo, webhookHttp: { post: async (url, options) => post(url, options) } }, () => 1_700_000_000_000);
}

test("signatures verify only for the right secret, timestamp and body", () => {
	const secret = webhookSecret(endpointId, 1);
	const signature = signPayload(secret, 1700000000, '{"a":1}');
	assert.ok(signature.startsWith("v1="));
	assert.equal(verifySignature(secret, 1700000000, '{"a":1}', signature), true);
	assert.equal(verifySignature(secret, 1700000001, '{"a":1}', signature), false);
	assert.equal(verifySignature(secret, 1700000000, '{"a":2}', signature), false);
	assert.equal(verifySignature(webhookSecret(endpointId, 2), 1700000000, '{"a":1}', signature), false);
	assert.equal(verifySignature(secret, 1700000000, '{"a":1}', "v1=short"), false);
});

test("secrets are stable per endpoint version and differ across versions and endpoints", () => {
	assert.equal(webhookSecret(endpointId, 1), webhookSecret(endpointId, 1));
	assert.notEqual(webhookSecret(endpointId, 1), webhookSecret(endpointId, 2));
	assert.notEqual(webhookSecret(endpointId, 1), webhookSecret("other", 1));
	assert.ok(webhookSecret(endpointId, 1).startsWith("whsec_"));
});

test("internal events map onto public webhook events", () => {
	assert.equal(webhookEventFor("created"), "conversation.created");
	assert.equal(webhookEventFor("claimed"), "conversation.assigned");
	assert.equal(webhookEventFor("transferred"), "conversation.assigned");
	assert.equal(webhookEventFor("reopened_by_customer"), "conversation.reopened");
	assert.equal(webhookEventFor("resolved"), "conversation.resolved");
	assert.equal(webhookEventFor("unknown"), null);
	assert.equal(webhookEventFor(null), null);
});

test("webhook urls must be public https without credentials", () => {
	assert.equal(urlProblem("https://example.com/hook", false), null);
	for (const bad of [
		"not a url",
		"http://example.com/hook",
		"https://user:pass@example.com/hook",
		"https://example.com/hook#frag",
		"https://localhost/hook",
		"https://service.internal/hook",
		"https://127.0.0.1/hook",
		"https://10.0.0.5/hook",
		"https://169.254.169.254/latest",
		"https://[::1]/hook",
	]) {
		assert.notEqual(urlProblem(bad, false), null, bad);
	}
	assert.equal(urlProblem("http://127.0.0.1:4000/hook", true), null);
});

test("private and reserved addresses are recognised", () => {
	for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "not-an-ip"]) {
		assert.equal(isPrivateAddress(address), true, address);
	}
	for (const address of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) {
		assert.equal(isPrivateAddress(address), false, address);
	}
});

test("a 2xx response marks the delivery succeeded and signs the request", async () => {
	const { repo, delivery } = await seeded();
	let captured: { headers: Record<string, string>; body: string } | undefined;
	const outcome = await deliverer(repo, async (_url, options) => {
		captured = options;
		return { status: 204 };
	}).execute({ deliveryId: delivery.id, final: false });

	assert.equal(outcome, "delivered");
	assert.equal(repo.attempts.at(-1)?.status, "SUCCEEDED");
	assert.equal(repo.successes, 1);
	assert.ok(captured);
	const timestamp = Number(captured.headers["X-SupportAI-Timestamp"]);
	assert.equal(timestamp, 1_700_000_000);
	assert.equal(captured.headers["X-SupportAI-Event"], "message.created");
	assert.equal(captured.headers["X-SupportAI-Delivery"], delivery.id);
	assert.equal(verifySignature(webhookSecret(endpointId, 1), timestamp, captured.body, captured.headers["X-SupportAI-Signature"] as string), true);
});

test("server errors retry until the final attempt, then fail", async () => {
	const { repo, delivery } = await seeded();
	const use = deliverer(repo, async () => ({ status: 503 }));
	assert.equal(await use.execute({ deliveryId: delivery.id, final: false }), "retry");
	assert.equal(repo.attempts.at(-1)?.status, "PENDING");
	assert.equal(repo.failures, 0);

	assert.equal(await use.execute({ deliveryId: delivery.id, final: true }), "failed");
	assert.equal(repo.attempts.at(-1)?.status, "FAILED");
	assert.equal(repo.failures, 1);
});

test("rate limiting and timeouts are retryable but client errors are not", async () => {
	for (const [status, expected] of [[429, "retry"], [408, "retry"], [400, "failed"], [404, "failed"]] as const) {
		const { repo, delivery } = await seeded();
		assert.equal(await deliverer(repo, async () => ({ status })).execute({ deliveryId: delivery.id, final: false }), expected, String(status));
	}
});

test("network errors retry and a blocked target fails immediately", async () => {
	const network = await seeded();
	assert.equal(
		await deliverer(network.repo, async () => {
			throw new Error("ECONNRESET");
		}).execute({ deliveryId: network.delivery.id, final: false }),
		"retry",
	);

	const blocked = await seeded();
	assert.equal(
		await deliverer(blocked.repo, async () => {
			throw new BlockedTargetError();
		}).execute({ deliveryId: blocked.delivery.id, final: false }),
		"failed",
	);
	assert.equal(blocked.repo.failures, 1);
});

test("410 Gone disables the endpoint", async () => {
	const { repo, delivery } = await seeded();
	assert.equal(await deliverer(repo, async () => ({ status: 410 })).execute({ deliveryId: delivery.id, final: false }), "failed");
	assert.deepEqual(repo.disabled, [endpointId]);
});

test("the endpoint is disabled once consecutive failures reach the threshold", async () => {
	const { repo, delivery } = await seeded();
	repo.failures = tenancyConfig.webhooks.failureThreshold - 1;
	await deliverer(repo, async () => ({ status: 400 })).execute({ deliveryId: delivery.id, final: false });
	assert.deepEqual(repo.disabled, [endpointId]);
});

test("delivering to a disabled endpoint or a finished delivery sends nothing", async () => {
	let calls = 0;
	const post = async () => {
		calls += 1;
		return { status: 200 };
	};
	const disabled = await seeded({ enabled: false });
	assert.equal(await deliverer(disabled.repo, post).execute({ deliveryId: disabled.delivery.id, final: false }), "skipped");

	const done = await seeded();
	(done.repo.deliveries.get(done.delivery.id) as DeliveryWithEndpoint).status = "SUCCEEDED";
	assert.equal(await deliverer(done.repo, post).execute({ deliveryId: done.delivery.id, final: false }), "skipped");
	assert.equal(await deliverer(done.repo, post).execute({ deliveryId: "missing", final: false }), "skipped");
	assert.equal(calls, 0);
});

function dispatcher(repo: FakeRepo) {
	const queued: string[] = [];
	const inline = { execute: async () => "delivered" } as unknown as DeliverWebhookUseCase;
	return { queued, dispatcher: new WebhookDispatcher({ webhookRepository: repo, webhookQueue: { enqueue: async (id) => void queued.push(id) }, deliverWebhookUseCase: inline }) };
}

const conversation = {
	id: "c1",
	status: "OPEN",
	subject: "Help",
	customer: { externalId: "user-1" },
	assigneeUserId: null,
	createdAt: new Date(),
	updatedAt: new Date(),
} as never;

test("the dispatcher fans out only to subscribed, enabled endpoints", async () => {
	const repo = new FakeRepo();
	repo.endpoints.set("a", endpoint({ id: "a", events: ["conversation.created"] }));
	repo.endpoints.set("b", endpoint({ id: "b", events: ["message.created"] }));
	repo.endpoints.set("c", endpoint({ id: "c", events: ["conversation.created"], enabled: false }));
	const { dispatcher: d, queued } = dispatcher(repo);

	await d.conversationEvent(app, conversation, "created");
	assert.equal(queued.length, 1);
	const payload = repo.deliveries.get(queued[0] as string)?.payload as { type: string; data: { conversation: { id: string } } };
	assert.equal(payload.type, "conversation.created");
	assert.equal(payload.data.conversation.id, "c1");

	await d.conversationEvent(app, conversation, "unmapped");
	assert.equal(queued.length, 1);
});

test("internal notes and system messages are never sent to webhooks", async () => {
	const repo = new FakeRepo();
	repo.endpoints.set("a", endpoint({ id: "a", events: ["message.created"] }));
	const { dispatcher: d, queued } = dispatcher(repo);
	const message = { id: "m", conversationId: "c1", sender: "CUSTOMER", body: "hi", internal: false, createdAt: new Date() };

	await d.messageEvent(app, { ...message, internal: true } as never);
	await d.messageEvent(app, { ...message, sender: "SYSTEM" } as never);
	assert.equal(queued.length, 0);
	await d.messageEvent(app, message as never);
	assert.equal(queued.length, 1);
});

test("a failing repository never breaks the caller", async () => {
	const repo = new FakeRepo();
	repo.findSubscribed = async () => {
		throw new Error("db down");
	};
	const { dispatcher: d } = dispatcher(repo);
	await assert.doesNotReject(d.conversationEvent(app, conversation, "created"));
});

test("without a queue the dispatcher delivers inline", async () => {
	const repo = new FakeRepo();
	repo.endpoints.set("a", endpoint({ id: "a", events: ["message.created"] }));
	const delivered: string[] = [];
	const d = new WebhookDispatcher({
		webhookRepository: repo,
		webhookQueue: null,
		deliverWebhookUseCase: { execute: async (input: { deliveryId: string; final: boolean }) => void delivered.push(`${input.deliveryId}:${input.final}`) } as unknown as DeliverWebhookUseCase,
	});
	await d.sendTo("a", app, "webhook.test", {});
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(delivered.length, 1);
	assert.ok(delivered[0]?.endsWith(":true"));
});

const audit = { record: async () => {} } as never;

test("creating a webhook returns the secret once and hides the secret version", async () => {
	const repo = new FakeRepo();
	const created = await new CreateWebhookUseCase({ webhookRepository: repo, auditService: audit }).execute({
		organizationId: "o",
		applicationId: app,
		actorId: "u",
		url: "https://example.com/hook",
		events: ["message.created"],
	});
	assert.equal("secretVersion" in created.endpoint, false);
	assert.equal(created.secret, webhookSecret(created.endpoint.id, 1));
});

test("the per-application webhook limit is enforced", async () => {
	const repo = new FakeRepo();
	for (let index = 0; index < tenancyConfig.limits.webhooksPerApplication; index += 1) repo.endpoints.set(`e${index}`, endpoint({ id: `e${index}` }));
	await assert.rejects(
		new CreateWebhookUseCase({ webhookRepository: repo, auditService: audit }).execute({
			organizationId: "o",
			applicationId: app,
			actorId: "u",
			url: "https://example.com/hook",
			events: ["message.created"],
		}),
		{ code: "LIMIT_EXCEEDED" },
	);
});

test("rotating the secret changes it and unknown endpoints are not found", async () => {
	const repo = new FakeRepo();
	repo.endpoints.set(endpointId, endpoint());
	const use = new RotateWebhookSecretUseCase({ webhookRepository: repo, auditService: audit });
	const rotated = await use.execute({ organizationId: "o", applicationId: app, actorId: "u", endpointId });
	assert.equal(rotated.secret, webhookSecret(endpointId, 2));
	assert.notEqual(rotated.secret, webhookSecret(endpointId, 1));
	await assert.rejects(use.execute({ organizationId: "o", applicationId: app, actorId: "u", endpointId: "missing" }), { code: "NOT_FOUND" });
});

test("test events and redelivery require an enabled endpoint, and redelivery skips in-flight deliveries", async () => {
	const { repo, delivery } = await seeded({ enabled: false });
	const sent: string[] = [];
	const scheduling = { sendTo: async () => "d-new", schedule: async (id: string) => void sent.push(id) } as unknown as WebhookDispatcher;

	await assert.rejects(new TestWebhookUseCase({ webhookRepository: repo, webhookDispatcher: scheduling }).execute({ applicationId: app, endpointId }), { code: "CONFLICT" });
	await assert.rejects(new RedeliverWebhookUseCase({ webhookRepository: repo, webhookDispatcher: scheduling }).execute({ applicationId: app, endpointId, deliveryId: delivery.id }), { code: "CONFLICT" });

	repo.endpoints.set(endpointId, endpoint());
	const redeliver = new RedeliverWebhookUseCase({ webhookRepository: repo, webhookDispatcher: scheduling });
	await assert.rejects(redeliver.execute({ applicationId: app, endpointId, deliveryId: delivery.id }), { code: "CONFLICT" });

	(repo.deliveries.get(delivery.id) as DeliveryWithEndpoint).status = "FAILED";
	await redeliver.execute({ applicationId: app, endpointId, deliveryId: delivery.id });
	assert.deepEqual(repo.resets, [delivery.id]);
	assert.deepEqual(sent, [delivery.id]);
	await assert.rejects(redeliver.execute({ applicationId: app, endpointId, deliveryId: "missing" }), { code: "NOT_FOUND" });
});
