import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { asValue, createContainer, InjectionMode } from "awilix";

import { AuthenticationError, ForbiddenError } from "../src/foundation/errors/app-error.js";
import { errorHandler } from "../src/foundation/middleware/error-handler.js";
import { requestScope } from "../src/foundation/middleware/request-scope.js";
import { MemoryRateLimiter } from "../src/foundation/rate-limit/rate-limiter.js";
import { apiKeyRouter } from "../src/modules/api-keys/routes/api-key.routes.js";
import { applicationRouter } from "../src/modules/applications/routes/application.routes.js";
import { membershipRouter } from "../src/modules/memberships/routes/membership.routes.js";
import { webhookRouter } from "../src/modules/webhooks/routes/webhook.routes.js";
import { planRouter } from "../src/modules/entitlements/routes/plan.routes.js";
import { realtimeRouter } from "../src/modules/realtime/routes/realtime.routes.js";
import { aiRouter } from "../src/modules/ai/routes/ai.routes.js";
import { knowledgeRouter } from "../src/modules/knowledge/routes/knowledge.routes.js";
import { conversationRouter } from "../src/modules/conversations/routes/conversation.routes.js";
import { customerRouter } from "../src/modules/customers/routes/customer.routes.js";
import { roleRouter } from "../src/modules/rbac/routes/role.routes.js";
import { organizationRouter } from "../src/modules/organizations/routes/organization.routes.js";
import type { ApiKeyPrincipal } from "../src/modules/api-keys/api-keys.types.js";
import { withServer } from "./helpers.js";

const org = "11111111-1111-4111-8111-111111111111";
const app = "22222222-2222-4222-8222-222222222222";
const user = "33333333-3333-4333-8333-333333333333";
const key = "44444444-4444-4444-8444-444444444444";
const invitation = "55555555-5555-4555-8555-555555555555";
const role = "66666666-6666-4666-8666-666666666666";
const conversationId = "77777777-7777-4777-8777-777777777777";
const articleId = "99999999-9999-4999-8999-999999999999";
const endpointId = "88888888-8888-4888-8888-888888888888";
const customerId = "88888888-8888-4888-8888-888888888888";

const identity = {
	user: { id: "user-1", email: "user@example.com", displayName: "User", emailVerifiedAt: new Date() },
	sessionId: "session-1",
};

const principal: ApiKeyPrincipal = {
	keyId: key,
	keyPrefix: "sak_abcdefgh",
	scopes: ["chat"],
	organizationId: org,
	application: { id: app, name: "Web", slug: "web", allowedOrigins: [] },
};

interface Call {
	scope: "organization" | "application";
	action: string;
}

function buildApp(options: { deny?: Error; authenticated?: boolean } = {}) {
	const calls: Call[] = [];
	let controllerHits = 0;

	const authorizer = {
		organization: async (_userId: string, organizationId: string, action: string) => {
			calls.push({ scope: "organization", action });
			if (options.deny) throw options.deny;
			return { organizationId, role: "OWNER" };
		},
		application: async (_userId: string, organizationId: string, applicationId: string, action: string) => {
			calls.push({ scope: "application", action });
			if (options.deny) throw options.deny;
			return { organizationId, applicationId, organizationRole: "OWNER", role: "OWNER", viaOrganization: true };
		},
	};

	const controller = new Proxy({}, {
		get: (_target, property) => {
			if (typeof property !== "string" || property === "then") return undefined;
			return async (_request: unknown, response: express.Response) => {
				controllerHits += 1;
				response.json({ ok: true });
			};
		},
	});

	const container = createContainer({ injectionMode: InjectionMode.PROXY, strict: true });
	container.register({
		rateLimiter: asValue(new MemoryRateLimiter()),
		authorizer: asValue(authorizer),
		organizationController: asValue(controller),
		membershipController: asValue(controller),
		applicationController: asValue(controller),
		apiKeyController: asValue(controller),
		roleController: asValue(controller),
		customerController: asValue(controller),
		conversationController: asValue(controller),
		serviceConversationController: asValue(controller),
		knowledgeController: asValue(controller),
		aiController: asValue(controller),
		webhookController: asValue(controller),
		realtimeController: asValue(controller),
		planController: asValue(controller),
		getCurrentUserUseCase: asValue({
			execute: async () => {
				if (options.authenticated === false) throw new AuthenticationError("Authentication required");
				return identity;
			},
		}),
		apiKeyAuthService: asValue({
			authenticate: async (input: { authorization?: string }) => {
				if (!input.authorization) throw new AuthenticationError("Invalid API key");
				return principal;
			},
		}),
	});

	const server = express();
	server.use(requestScope(container));
	server.use(express.json({ limit: "64kb" }));
	server.use(organizationRouter());
	server.use(membershipRouter());
	server.use(applicationRouter());
	server.use(apiKeyRouter());
	server.use(roleRouter());
	server.use(customerRouter());
	server.use(conversationRouter());
	server.use(knowledgeRouter());
	server.use(aiRouter());
	server.use(realtimeRouter());
	server.use(planRouter());
	server.use(webhookRouter());
	server.use(errorHandler);
	return { server, calls, hits: () => controllerHits };
}

const o = `/organizations/${org}`;
const a = `${o}/applications/${app}`;

const routes: Array<{ method: string; path: string; scope: Call["scope"]; action: string }> = [
	{ method: "GET", path: o, scope: "organization", action: "organization.read" },
	{ method: "PATCH", path: o, scope: "organization", action: "organization.update" },
	{ method: "DELETE", path: o, scope: "organization", action: "organization.archive" },
	{ method: "GET", path: `${o}/members`, scope: "organization", action: "member.read" },
	{ method: "PATCH", path: `${o}/members/${user}`, scope: "organization", action: "member.manage" },
	{ method: "DELETE", path: `${o}/members/${user}`, scope: "organization", action: "organization.read" },
	{ method: "POST", path: `${o}/invitations`, scope: "organization", action: "invitation.manage" },
	{ method: "GET", path: `${o}/invitations`, scope: "organization", action: "invitation.manage" },
	{ method: "DELETE", path: `${o}/invitations/${invitation}`, scope: "organization", action: "invitation.manage" },
	{ method: "POST", path: `${o}/applications`, scope: "organization", action: "application.create" },
	{ method: "GET", path: `${o}/applications`, scope: "organization", action: "application.list" },
	{ method: "GET", path: a, scope: "application", action: "application.read" },
	{ method: "PATCH", path: a, scope: "application", action: "application.update" },
	{ method: "DELETE", path: a, scope: "application", action: "application.archive" },
	{ method: "GET", path: `${a}/members`, scope: "application", action: "application.member.read" },
	{ method: "POST", path: `${a}/members`, scope: "application", action: "application.member.manage" },
	{ method: "PATCH", path: `${a}/members/${user}`, scope: "application", action: "application.member.manage" },
	{ method: "DELETE", path: `${a}/members/${user}`, scope: "application", action: "application.member.manage" },
	{ method: "GET", path: `${a}/api-keys`, scope: "application", action: "api-key.read" },
	{ method: "POST", path: `${a}/api-keys`, scope: "application", action: "api-key.manage" },
	{ method: "DELETE", path: `${a}/api-keys/${key}`, scope: "application", action: "api-key.manage" },
	{ method: "POST", path: `${a}/api-keys/${key}/rotate`, scope: "application", action: "api-key.manage" },
	{ method: "GET", path: `${o}/roles`, scope: "organization", action: "role.read" },
	{ method: "GET", path: `${o}/roles/permissions`, scope: "organization", action: "role.read" },
	{ method: "POST", path: `${o}/roles`, scope: "organization", action: "role.manage" },
	{ method: "GET", path: `${o}/roles/${role}`, scope: "organization", action: "role.read" },
	{ method: "PATCH", path: `${o}/roles/${role}`, scope: "organization", action: "role.manage" },
	{ method: "DELETE", path: `${o}/roles/${role}`, scope: "organization", action: "role.manage" },
	{ method: "GET", path: `${o}/roles/${role}/members`, scope: "organization", action: "role.read" },
	{ method: "PUT", path: `${o}/roles/${role}/members/${user}`, scope: "organization", action: "role.assign" },
	{ method: "DELETE", path: `${o}/roles/${role}/members/${user}`, scope: "organization", action: "role.assign" },
	{ method: "GET", path: `${a}/roles`, scope: "application", action: "application.role.read" },
	{ method: "POST", path: `${a}/roles`, scope: "application", action: "application.role.manage" },
	{ method: "PATCH", path: `${a}/roles/${role}`, scope: "application", action: "application.role.manage" },
	{ method: "DELETE", path: `${a}/roles/${role}`, scope: "application", action: "application.role.manage" },
	{ method: "PUT", path: `${a}/roles/${role}/members/${user}`, scope: "application", action: "application.role.assign" },
	{ method: "DELETE", path: `${a}/roles/${role}/members/${user}`, scope: "application", action: "application.role.assign" },
	{ method: "GET", path: `${a}/customers`, scope: "application", action: "customer.read" },
	{ method: "GET", path: `${a}/customers/${customerId}`, scope: "application", action: "customer.read" },
	{ method: "PATCH", path: `${a}/customers/${customerId}`, scope: "application", action: "customer.manage" },
	{ method: "GET", path: `${a}/conversations`, scope: "application", action: "conversation.read" },
	{ method: "GET", path: `${a}/conversations/${conversationId}`, scope: "application", action: "conversation.read" },
	{ method: "GET", path: `${a}/conversations/${conversationId}/messages`, scope: "application", action: "conversation.read" },
	{ method: "POST", path: `${a}/conversations/${conversationId}/messages`, scope: "application", action: "conversation.reply" },
	{ method: "POST", path: `${a}/conversations/${conversationId}/claim`, scope: "application", action: "conversation.claim" },
	{ method: "POST", path: `${a}/conversations/${conversationId}/assign`, scope: "application", action: "conversation.assign" },
	{ method: "POST", path: `${a}/conversations/${conversationId}/transfer`, scope: "application", action: "conversation.transfer" },
	{ method: "POST", path: `${a}/conversations/${conversationId}/release`, scope: "application", action: "conversation.transfer" },
	{ method: "POST", path: `${a}/conversations/${conversationId}/resolve`, scope: "application", action: "conversation.resolve" },
	{ method: "POST", path: `${a}/conversations/${conversationId}/reopen`, scope: "application", action: "conversation.resolve" },
	{ method: "POST", path: `${a}/conversations/${conversationId}/close`, scope: "application", action: "conversation.resolve" },
	{ method: "GET", path: `${a}/knowledge/articles`, scope: "application", action: "knowledge.read" },
	{ method: "GET", path: `${a}/knowledge/articles/${articleId}`, scope: "application", action: "knowledge.read" },
	{ method: "POST", path: `${a}/knowledge/articles`, scope: "application", action: "knowledge.manage" },
	{ method: "PATCH", path: `${a}/knowledge/articles/${articleId}`, scope: "application", action: "knowledge.manage" },
	{ method: "POST", path: `${a}/knowledge/articles/${articleId}/publish`, scope: "application", action: "knowledge.manage" },
	{ method: "POST", path: `${a}/knowledge/articles/${articleId}/unpublish`, scope: "application", action: "knowledge.manage" },
	{ method: "DELETE", path: `${a}/knowledge/articles/${articleId}`, scope: "application", action: "knowledge.manage" },
	{ method: "GET", path: `${a}/webhooks`, scope: "application", action: "webhook.read" },
	{ method: "POST", path: `${a}/webhooks`, scope: "application", action: "webhook.manage" },
	{ method: "GET", path: `${a}/webhooks/${endpointId}`, scope: "application", action: "webhook.read" },
	{ method: "PATCH", path: `${a}/webhooks/${endpointId}`, scope: "application", action: "webhook.manage" },
	{ method: "DELETE", path: `${a}/webhooks/${endpointId}`, scope: "application", action: "webhook.manage" },
	{ method: "POST", path: `${a}/webhooks/${endpointId}/rotate-secret`, scope: "application", action: "webhook.manage" },
	{ method: "POST", path: `${a}/webhooks/${endpointId}/test`, scope: "application", action: "webhook.manage" },
	{ method: "GET", path: `${a}/webhooks/${endpointId}/deliveries`, scope: "application", action: "webhook.read" },
	{ method: "POST", path: `${a}/webhooks/${endpointId}/deliveries/${articleId}/redeliver`, scope: "application", action: "webhook.manage" },
	{ method: "GET", path: `${o}/plan`, scope: "organization", action: "organization.read" },
	{ method: "GET", path: `${a}/events`, scope: "application", action: "conversation.read" },
	{ method: "GET", path: `${a}/ai/settings`, scope: "application", action: "application.read" },
	{ method: "PUT", path: `${a}/ai/settings`, scope: "application", action: "application.update" },
];

function send(baseUrl: string, method: string, path: string, headers: Record<string, string> = {}, body: unknown = {}) {
	return fetch(`${baseUrl}${path}`, {
		method,
		headers: { "Content-Type": "application/json", Authorization: "Bearer access-token", ...headers },
		body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body),
	});
}

test("every tenant route asks the authorizer for the intended action before doing anything else", async () => {
	for (const route of routes) {
		const { server, calls, hits } = buildApp({ deny: new ForbiddenError("Insufficient permissions") });
		await withServer(server, async (baseUrl) => {
			const response = await send(baseUrl, route.method, route.path);
			assert.equal(response.status, 403, `${route.method} ${route.path}`);
			assert.deepEqual(calls, [{ scope: route.scope, action: route.action }], `${route.method} ${route.path}`);
			assert.equal(hits(), 0, `${route.method} ${route.path} reached the controller`);
		});
	}
});

test("tenant routes require authentication before any authorization check", async () => {
	for (const route of routes) {
		const { server, calls, hits } = buildApp({ authenticated: false });
		await withServer(server, async (baseUrl) => {
			const response = await send(baseUrl, route.method, route.path);
			assert.equal(response.status, 401, `${route.method} ${route.path}`);
			assert.equal(calls.length, 0);
			assert.equal(hits(), 0);
		});
	}
});

test("malformed identifiers are rejected as bad requests without consulting the authorizer", async () => {
	const { server, calls } = buildApp();
	await withServer(server, async (baseUrl) => {
		for (const path of ["/organizations/not-a-uuid", `/organizations/${org}/applications/nope`, `/organizations/${org}/applications/${app}/api-keys`.replace(app, "1")]) {
			const response = await send(baseUrl, "GET", path);
			assert.equal(response.status, 400, path);
		}
		assert.equal(calls.length, 0);
	});
});

test("an authorised read reaches the controller", async () => {
	const { server, calls, hits } = buildApp();
	await withServer(server, async (baseUrl) => {
		const response = await send(baseUrl, "GET", `${o}/members`);
		assert.equal(response.status, 200);
		assert.deepEqual(calls, [{ scope: "organization", action: "member.read" }]);
		assert.equal(hits(), 1);
	});
});

test("api key creation and rotation responses are never cached", async () => {
	const { server } = buildApp();
	await withServer(server, async (baseUrl) => {
		const created = await send(baseUrl, "POST", `${a}/api-keys`, {}, { name: "Backend", scopes: ["chat"] });
		assert.equal(created.status, 200);
		assert.equal(created.headers.get("cache-control"), "no-store");

		const rotated = await send(baseUrl, "POST", `${a}/api-keys/${key}/rotate`);
		assert.equal(rotated.status, 200);
		assert.equal(rotated.headers.get("cache-control"), "no-store");
	});
});

test("webhook secret responses are never cached", async () => {
	const { server } = buildApp();
	await withServer(server, async (baseUrl) => {
		const created = await send(baseUrl, "POST", `${a}/webhooks`, {}, { url: "https://example.com/hook", events: ["message.created"] });
		assert.equal(created.status, 200);
		assert.equal(created.headers.get("cache-control"), "no-store");

		const rotated = await send(baseUrl, "POST", `${a}/webhooks/${endpointId}/rotate-secret`);
		assert.equal(rotated.status, 200);
		assert.equal(rotated.headers.get("cache-control"), "no-store");

		const invalid = await send(baseUrl, "POST", `${a}/webhooks`, {}, { url: "http://example.com/hook", events: [] });
		assert.equal(invalid.status, 400);
	});
});

test("the service endpoint accepts only a valid api key and is not cached", async () => {
	const { server, hits } = buildApp();
	await withServer(server, async (baseUrl) => {
		const anonymous = await fetch(`${baseUrl}/service/application`);
		assert.equal(anonymous.status, 401);
		assert.equal(anonymous.headers.get("cache-control"), "no-store");
		assert.equal(hits(), 0);

		const authorised = await fetch(`${baseUrl}/service/application`, { headers: { Authorization: "Bearer sak_whatever" } });
		assert.equal(authorised.status, 200);
		assert.equal(authorised.headers.get("cache-control"), "no-store");
		assert.equal(hits(), 1);
	});
});

test("service conversation and customer endpoints need an api key with the right scope", async () => {
	const { server, hits } = buildApp();
	await withServer(server, async (baseUrl) => {
		const calls: Array<{ method: string; path: string; body?: unknown }> = [
			{ method: "PUT", path: "/service/customers/user-1", body: {} },
			{ method: "POST", path: "/service/conversations", body: { customer: { externalId: "user-1" }, message: "hi" } },
			{ method: "GET", path: `/service/conversations/${conversationId}` },
			{ method: "GET", path: `/service/conversations/${conversationId}/messages` },
			{ method: "POST", path: `/service/conversations/${conversationId}/messages`, body: { body: "hi" } },
			{ method: "POST", path: `/service/conversations/${conversationId}/escalate`, body: {} },
			{ method: "POST", path: `/service/conversations/${conversationId}/ai-reply`, body: {} },
			{ method: "GET", path: "/service/knowledge/search?q=refund" },
			{ method: "GET", path: `/service/conversations/${conversationId}/events` },
		];
		for (const call of calls) {
			const anonymous = await fetch(`${baseUrl}${call.path}`, {
				method: call.method,
				headers: { "Content-Type": "application/json" },
				body: call.body === undefined ? undefined : JSON.stringify(call.body),
			});
			assert.equal(anonymous.status, 401, `${call.method} ${call.path}`);
			assert.equal(anonymous.headers.get("cache-control"), "no-store");
		}
		assert.equal(hits(), 0);

		const headers = { "Content-Type": "application/json", Authorization: "Bearer sak_whatever" };
		const lacking = await fetch(`${baseUrl}/service/conversations`, {
			method: "POST",
			headers,
			body: JSON.stringify({ customer: { externalId: "user-1" }, message: "hi" }),
		});
		assert.equal(lacking.status, 403);
		assert.equal(hits(), 0);

		const permitted = await fetch(`${baseUrl}/service/conversations/${conversationId}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({ body: "hi" }),
		});
		assert.equal(permitted.status, 200);
		assert.equal(permitted.headers.get("cache-control"), "no-store");
		assert.equal(hits(), 1);
	});
});
