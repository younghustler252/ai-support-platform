import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { asValue } from "awilix";

import { MemoryRateLimiter } from "../src/foundation/rate-limit/rate-limiter.js";
import { InProcessRealtimeBus } from "../src/infrastructure/realtime/realtime-bus.js";

import { auditSpy, emailSpy } from "./helpers.js";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const skip = enabled ? false : "set TEST_DATABASE_URL to a migrated Postgres database to run";
const password = "correct-horse-battery-staple";
const origin = "http://localhost:3000";
const run = randomUUID().slice(0, 8);

type Prisma = typeof import("../src/infrastructure/database/prisma.js")["prisma"];

interface Person {
	id: string;
	email: string;
	headers: Record<string, string>;
}

let baseUrl = "";
let prisma: Prisma;
let closeServer: () => Promise<void> = async () => {};
const mailbox = emailSpy();
const emails: string[] = [];
let providerText = "About ten days.";

async function call(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
	const response = await fetch(`${baseUrl}/api/v1${path}`, {
		method: init.method ?? "GET",
		headers: { "Content-Type": "application/json", Origin: origin, ...init.headers },
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
	const text = await response.text();
	return { status: response.status, body: text ? (JSON.parse(text) as { data?: any; error?: { code: string } }) : {} };
}

async function signUp(label: string): Promise<Person> {
	const email = `${label}-${run}@example.com`;
	emails.push(email);
	assert.equal((await call("/auth/register", { method: "POST", body: { email, password, displayName: label } })).status, 201);
	const token = mailbox.sent.find((item) => item.kind === "verify" && item.email === email)?.token;
	assert.ok(token);
	assert.equal((await call("/auth/verify-email", { method: "POST", body: { token } })).status, 200);
	const login = await call("/auth/login", { method: "POST", body: { email, password } });
	assert.equal(login.status, 200);
	const row = await prisma.user.findUniqueOrThrow({ where: { email } });
	return { id: row.id, email, headers: { Authorization: `Bearer ${login.body.data.accessToken}` } };
}

before(async () => {
	if (!enabled) return;
	const { container } = await import("../src/container/index.js");
	const { createApp } = await import("../src/app.js");
	({ prisma } = await import("../src/infrastructure/database/prisma.js"));
	const { syncRbacCatalog } = await import("../src/modules/rbac/services/catalog-sync.js");
	await syncRbacCatalog(prisma);

	container.register({
		authEmailService: asValue(mailbox),
		auditService: asValue(auditSpy()),
		rateLimiter: asValue(new MemoryRateLimiter()),
		realtimeBus: asValue(new InProcessRealtimeBus()),
		aiReplyScheduler: asValue({ schedule: async () => {} }),
		aiProvider: asValue({
			configured: true,
			complete: async () => ({ text: providerText, model: "fake-model", inputTokens: 11, outputTokens: 7 }),
		}),
	});

	const server = createServer(createApp());
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("No TCP port");
	baseUrl = `http://127.0.0.1:${address.port}`;
	closeServer = async () => {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	};
});

after(async () => {
	if (!enabled) return;
	const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
	const ids = users.map((user) => user.id);
	const organizations = await prisma.organization.findMany({ where: { createdByUserId: { in: ids } }, select: { id: true } });
	const organizationIds = organizations.map((organization) => organization.id);
	const applications = await prisma.application.findMany({ where: { organizationId: { in: organizationIds } }, select: { id: true } });
	const applicationIds = applications.map((application) => application.id);

	await prisma.apiKey.deleteMany({ where: { applicationId: { in: applicationIds } } });
	await prisma.applicationMembershipRole.deleteMany({ where: { membership: { applicationId: { in: applicationIds } } } });
	await prisma.applicationMembership.deleteMany({ where: { applicationId: { in: applicationIds } } });
	await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: organizationIds } } } });
	await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: organizationIds } } });
	await prisma.application.deleteMany({ where: { id: { in: applicationIds } } });
	await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
	await prisma.user.deleteMany({ where: { id: { in: ids } } });
	await closeServer();
	await prisma.$disconnect();
});

type Result = Awaited<ReturnType<typeof call>>;

async function createOrg(owner: Person, name: string, appNames: string[]) {
	const orgId = (await call("/organizations", { method: "POST", headers: owner.headers, body: { name: `${name} ${run}` } })).body.data.organization.id as string;
	const apps: string[] = [];
	for (const appName of appNames) {
		apps.push((await call(`/organizations/${orgId}/applications`, { method: "POST", headers: owner.headers, body: { name: appName } })).body.data.application.id as string);
	}
	return { orgId, apps };
}

async function createKey(owner: Person, orgId: string, appId: string, scopes: string[]): Promise<Record<string, string>> {
	const key = await call(`/organizations/${orgId}/applications/${appId}/api-keys`, { method: "POST", headers: owner.headers, body: { name: "Test", scopes } });
	assert.equal(key.status, 201);
	return { Authorization: `Bearer ${key.body.data.key as string}` };
}

async function createRole(owner: Person, orgId: string, name: string, permissions: unknown[]): Promise<string> {
	const role = await call(`/organizations/${orgId}/roles`, { method: "POST", headers: owner.headers, body: { name, permissions } });
	assert.equal(role.status, 201, JSON.stringify(role.body));
	return role.body.data.role.id as string;
}

async function addMember(owner: Person, orgId: string, person: Person, roleId: string) {
	await prisma.organizationMembership.create({ data: { organizationId: orgId, userId: person.id, status: "ACTIVE", role: "MEMBER" } });
	assert.equal((await call(`/organizations/${orgId}/roles/${roleId}/members/${person.id}`, { method: "PUT", headers: owner.headers })).status, 200);
}

const statusOf = (result: Result) => result.body.data?.conversation?.status as string | undefined;

test("knowledge search is tenant scoped, publish aware and follows edits", { skip }, async () => {
	const alice = await signUp("kalice");
	const dave = await signUp("kdave");
	const a = await createOrg(alice, "Knowledge", ["Web", "Mobile"]);
	const [web, mobile] = a.apps as [string, string];
	const keyWeb = await createKey(alice, a.orgId, web, ["knowledge:read"]);
	const keyMobile = await createKey(alice, a.orgId, mobile, ["knowledge:read"]);
	const articles = `/organizations/${a.orgId}/applications/${web}/knowledge/articles`;
	const search = (headers: Record<string, string>, q: string) => call(`/service/knowledge/search?q=${encodeURIComponent(q)}`, { headers });

	const created = await call(articles, { method: "POST", headers: alice.headers, body: { title: "Refund policy", content: "Refunds are processed within five business days of approval." } });
	assert.equal(created.status, 201);
	assert.equal(created.body.data.article.status, "DRAFT");
	const articleId = created.body.data.article.id as string;

	assert.equal((await search(keyWeb, "how long do refunds take")).body.data.passages.length, 0);

	assert.equal((await call(`${articles}/${articleId}/publish`, { method: "POST", headers: alice.headers })).status, 200);
	assert.equal((await call(`${articles}/${articleId}/publish`, { method: "POST", headers: alice.headers })).status, 409);
	const found = await search(keyWeb, "how long do refunds take");
	assert.equal(found.body.data.passages.length, 1);
	assert.equal(found.body.data.passages[0].title, "Refund policy");
	assert.equal((await search(keyMobile, "how long do refunds take")).body.data.passages.length, 0);
	assert.equal((await search(keyWeb, "a & b | !c")).body.data.passages.length, 0);

	assert.equal((await call(`${articles}/${articleId}`, { method: "PATCH", headers: alice.headers, body: { content: "Refunds take ten days." } })).status, 200);
	assert.equal((await search(keyWeb, "ten days")).body.data.passages.length, 1);
	assert.equal((await search(keyWeb, "five business")).body.data.passages.length, 0);

	assert.equal((await call(`${articles}/${articleId}/unpublish`, { method: "POST", headers: alice.headers })).status, 200);
	assert.equal((await search(keyWeb, "refunds")).body.data.passages.length, 0);

	assert.equal((await call(`${articles}/${articleId}`, { headers: dave.headers })).status, 404);
	assert.equal((await call(`${articles}/${articleId}`, { method: "DELETE", headers: alice.headers })).status, 204);
	assert.equal(await prisma.knowledgeChunk.count({ where: { articleId } }), 0);
});

test("support conversations stay isolated, claims are race free and the service API never leaks internals", { skip }, async () => {
	const alice = await signUp("salice");
	const bob = await signUp("sbob");
	const carol = await signUp("scarol");
	const dave = await signUp("sdave");

	const a = await createOrg(alice, "Support", ["Web", "Mobile"]);
	const [web, mobile] = a.apps as [string, string];
	const b = await createOrg(dave, "Other", ["Web"]);
	const [otherApp] = b.apps as [string];

	const agentRole = await createRole(alice, a.orgId, "Agent", ["conversation.read", "conversation.reply", "conversation.claim", "conversation.transfer", "conversation.resolve", "customer.read"]);
	const limitedRole = await createRole(alice, a.orgId, "Limited", [{ code: "conversation.read", scope: "ASSIGNED" }, { code: "conversation.reply", scope: "ASSIGNED" }, "conversation.claim"]);
	await addMember(alice, a.orgId, bob, agentRole);
	await addMember(alice, a.orgId, carol, limitedRole);

	const scopes = ["chat", "conversations:read", "conversations:write", "knowledge:read"];
	const keyWeb = await createKey(alice, a.orgId, web, scopes);
	const keyMobile = await createKey(alice, a.orgId, mobile, scopes);
	const keyOther = await createKey(dave, b.orgId, otherApp, scopes);

	const articles = `/organizations/${a.orgId}/applications/${web}/knowledge/articles`;
	const article = await call(articles, { method: "POST", headers: alice.headers, body: { title: "Refunds", content: "Refunds take ten days." } });
	await call(`${articles}/${article.body.data.article.id}/publish`, { method: "POST", headers: alice.headers });

	const base = `/organizations/${a.orgId}/applications/${web}`;
	const start = (headers: Record<string, string>, externalId: string, message: string) =>
		call("/service/conversations", { method: "POST", headers, body: { customer: { externalId, displayName: "Customer" }, message } });

	const first = await start(keyWeb, "user-1", "How long do refunds take?");
	assert.equal(first.status, 201);
	assert.equal(first.body.data.conversation.status, "AI_ACTIVE");
	assert.deepEqual(Object.keys(first.body.data.message).sort(), ["body", "createdAt", "id", "sender"]);
	const c1 = first.body.data.conversation.id as string;
	const service = (path: string, headers = keyWeb, init: { method?: string; body?: unknown } = {}) => call(`/service/conversations/${c1}${path}`, { headers, ...init });

	assert.equal((await service("", keyMobile)).status, 404);
	assert.equal((await service("", keyOther)).status, 404);
	assert.equal((await service("/messages", keyMobile)).status, 404);
	assert.equal((await service("/messages", keyMobile, { method: "POST", body: { body: "intruder" } })).status, 404);
	assert.equal((await service("/ai-reply", keyOther, { method: "POST" })).status, 404);
	assert.equal((await service("/events", keyMobile)).status, 404);
	assert.equal((await call(`/organizations/${a.orgId}/applications/${web}/conversations/${c1}`, { headers: dave.headers })).status, 404);
	assert.equal((await call(`/organizations/${b.orgId}/applications/${otherApp}/conversations/${c1}`, { headers: dave.headers })).status, 404);

	providerText = "Refunds take ten days.";
	const replied = await service("/ai-reply", keyWeb, { method: "POST" });
	assert.equal(replied.status, 200);
	assert.equal(replied.body.data.outcome, "replied");
	assert.equal(replied.body.data.message.sender, "AI");
	assert.equal((await service("/ai-reply", keyWeb, { method: "POST" })).status, 409);

	assert.equal((await service("/messages", keyWeb, { method: "POST", body: { body: "Please get me a human" } })).status, 201);
	providerText = "[[HANDOFF]]";
	const handoff = await service("/ai-reply", keyWeb, { method: "POST" });
	assert.equal(handoff.body.data.outcome, "escalated");
	assert.equal(handoff.body.data.reason, "not_answerable");
	assert.equal(statusOf(await call(`${base}/conversations/${c1}`, { headers: alice.headers })), "WAITING_FOR_AGENT");

	const usage = await prisma.usageEvent.findMany({ where: { applicationId: web, metric: "ai.request" }, orderBy: { createdAt: "asc" } });
	assert.equal(usage.length, 2);
	assert.equal((usage[0]?.metadata as { inputTokens: number }).inputTokens, 11);

	const reply = (who: Person, id = c1, body: unknown = { body: "On it" }) => call(`${base}/conversations/${id}/messages`, { method: "POST", headers: who.headers, body });
	const act = (who: Person, action: string, body: unknown = undefined, id = c1) => call(`${base}/conversations/${id}/${action}`, { method: "POST", headers: who.headers, body });

	assert.equal((await reply(bob)).status, 409);
	assert.equal((await act(dave, "claim")).status, 404);
	assert.equal(statusOf(await act(bob, "claim")), "ASSIGNED_TO_AGENT");
	assert.equal((await act(alice, "claim")).status, 409);
	assert.equal((await reply(bob)).status, 201);
	assert.equal((await reply(bob, c1, { body: "Check their account first", internal: true })).status, 201);

	const publicMessages = (await service("/messages")).body.data.messages as Array<Record<string, unknown>>;
	assert.ok(publicMessages.length >= 4);
	assert.ok(publicMessages.every((item) => Object.keys(item).sort().join() === "body,createdAt,id,sender"));
	assert.ok(!JSON.stringify(publicMessages).includes("Check their account first"));
	assert.ok(!JSON.stringify(publicMessages).includes(bob.id));
	const agentMessages = (await call(`${base}/conversations/${c1}/messages`, { headers: bob.headers })).body.data.messages as Array<{ body: string; internal: boolean }>;
	assert.ok(agentMessages.some((item) => item.internal && item.body === "Check their account first"));

	assert.equal((await act(bob, "assign", { userId: carol.id })).status, 403);
	assert.equal((await act(alice, "assign", { userId: dave.id })).status, 400);
	assert.equal(statusOf(await act(bob, "transfer", { userId: carol.id, note: "billing" })), "ASSIGNED_TO_AGENT");
	assert.equal((await act(bob, "transfer", { userId: carol.id })).status, 409);

	const second = (await start(keyWeb, "user-2", "Where is my invoice?")).body.data.conversation.id as string;
	const third = (await start(keyWeb, "user-3", "Cancel my plan")).body.data.conversation.id as string;
	const carolList = (await call(`${base}/conversations`, { headers: carol.headers })).body.data.conversations as Array<{ id: string; assigneeUserId: string }>;
	assert.deepEqual(carolList.map((item) => item.id), [c1]);
	assert.equal((await call(`${base}/conversations/${second}`, { headers: carol.headers })).status, 404);
	assert.equal((await call(`${base}/conversations/${second}/messages`, { headers: carol.headers })).status, 404);
	assert.equal((await reply(carol, second)).status, 404);
	assert.equal((await reply(carol, c1, { body: "Carol here" })).status, 201);
	const everyone = (await call(`${base}/conversations`, { headers: bob.headers })).body.data.conversations as Array<{ id: string }>;
	assert.ok([c1, second, third].every((id) => everyone.some((item) => item.id === id)));

	const race = await Promise.all([act(bob, "claim", undefined, third), act(alice, "claim", undefined, third), act(carol, "claim", undefined, third)]);
	assert.deepEqual(race.map((item) => item.status).sort(), [200, 409, 409]);
	const assignments = await prisma.conversationAssignment.findMany({ where: { conversationId: third, endedAt: null } });
	assert.equal(assignments.length, 1);

	const paged = await call(`${base}/conversations?limit=1`, { headers: alice.headers });
	assert.equal(paged.body.data.conversations.length, 1);
	assert.ok(paged.body.meta.nextCursor);
	const next = await call(`${base}/conversations?limit=1&cursor=${encodeURIComponent(paged.body.meta.nextCursor)}`, { headers: alice.headers });
	assert.notEqual(next.body.data.conversations[0].id, paged.body.data.conversations[0].id);
	assert.equal((await call(`${base}/conversations?cursor=garbage`, { headers: alice.headers })).status, 400);

	assert.equal((await act(carol, "resolve")).status, 403);
	assert.equal(statusOf(await act(bob, "resolve")), "RESOLVED");
	assert.equal((await reply(bob, c1)).status, 409);
	assert.equal((await reply(carol, c1)).status, 404);
	const reopened = await service("/messages", keyWeb, { method: "POST", body: { body: "Thanks, one more thing" } });
	assert.equal(reopened.status, 201);
	assert.equal(reopened.body.data.reopened, true);
	assert.equal(statusOf(await call(`${base}/conversations/${c1}`, { headers: alice.headers })), "WAITING_FOR_AGENT");
	assert.equal(statusOf(await act(alice, "close")), "CLOSED");
	assert.equal((await service("/messages", keyWeb, { method: "POST", body: { body: "hello?" } })).status, 409);

	const history = await prisma.conversationAssignment.findMany({ where: { conversationId: c1 }, orderBy: { assignedAt: "asc" } });
	assert.deepEqual(history.map((item) => item.endReason), ["TRANSFERRED", "RESOLVED"]);
	assert.ok(history.every((item) => item.endedAt !== null));

	const sameExternal = await start(keyMobile, "user-1", "Hi from mobile");
	assert.equal(sameExternal.status, 201);
	const customers = (await call(`${base}/customers`, { headers: bob.headers })).body.data.customers as Array<{ externalId: string; applicationId: string }>;
	assert.ok(customers.every((item) => item.applicationId === web));
	assert.equal(customers.filter((item) => item.externalId === "user-1").length, 1);
	assert.equal((await call(`/organizations/${a.orgId}/applications/${mobile}/customers`, { headers: dave.headers })).status, 404);

	for (let index = 0; index < 5; index += 1) assert.equal((await start(keyWeb, "busy-user", `question ${index}`)).status, 201);
	assert.equal((await start(keyWeb, "busy-user", "one more")).status, 403);
});
