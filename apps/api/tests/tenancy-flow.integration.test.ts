import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { asValue } from "awilix";

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
const invitations: Array<{ email: string; token: string }> = [];
const emails: string[] = [];

async function call(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
	const response = await fetch(`${baseUrl}/api/v1${path}`, {
		method: init.method ?? "GET",
		headers: { "Content-Type": "application/json", Origin: origin, ...init.headers },
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
	const text = await response.text();
	return { status: response.status, headers: response.headers, body: text ? (JSON.parse(text) as { data?: any; error?: { code: string } }) : {} };
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

	container.register({
		authEmailService: asValue(mailbox),
		auditService: asValue(auditSpy()),
		invitationEmailService: asValue({
			sendInvitation: async (email: string, input: { token: string }) => { invitations.push({ email, token: input.token }); },
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
	await prisma.organization.deleteMany({ where: { createdByUserId: { in: ids } } });
	await prisma.user.deleteMany({ where: { id: { in: ids } } });
	await closeServer();
	await prisma.$disconnect();
});

test("tenants are isolated, invitations work and API keys follow their lifecycle", { skip }, async () => {
	const alice = await signUp("alice");
	const bob = await signUp("bob");
	const carol = await signUp("carol");

	const created = await call("/organizations", { method: "POST", headers: alice.headers, body: { name: `Acme ${run}` } });
	assert.equal(created.status, 201);
	const orgId = created.body.data.organization.id as string;

	const bobOrg = await call("/organizations", { method: "POST", headers: bob.headers, body: { name: `Bobs ${run}` } });
	assert.equal(bobOrg.status, 201);
	const bobOrgId = bobOrg.body.data.organization.id as string;

	assert.equal((await call(`/organizations/${orgId}`, { headers: bob.headers })).status, 404);
	assert.equal((await call(`/organizations/${orgId}/members`, { headers: bob.headers })).status, 404);
	assert.equal((await call(`/organizations/${orgId}/applications`, { headers: bob.headers })).status, 404);
	assert.equal((await call(`/organizations/${orgId}`, { method: "PATCH", headers: bob.headers, body: { name: "Hijack" } })).status, 404);
	assert.equal((await call(`/organizations/${orgId}`, { method: "DELETE", headers: bob.headers })).status, 404);

	const listed = await call("/organizations", { headers: bob.headers });
	assert.deepEqual(listed.body.data.organizations.map((item: { id: string }) => item.id), [bobOrgId]);

	const appCreated = await call(`/organizations/${orgId}/applications`, {
		method: "POST",
		headers: alice.headers,
		body: { name: "Web", allowedOrigins: ["https://Example.com/"] },
	});
	assert.equal(appCreated.status, 201);
	const appId = appCreated.body.data.application.id as string;
	assert.deepEqual(appCreated.body.data.application.allowedOrigins, ["https://example.com"]);

	assert.equal((await call(`/organizations/${bobOrgId}/applications/${appId}`, { headers: bob.headers })).status, 404);
	assert.equal((await call(`/organizations/${orgId}/applications/${appId}/api-keys`, { headers: bob.headers })).status, 404);

	const invite = await call(`/organizations/${orgId}/invitations`, { method: "POST", headers: alice.headers, body: { email: bob.email, role: "MEMBER" } });
	assert.equal(invite.status, 201);
	assert.ok(!JSON.stringify(invite.body).includes(invitations.at(-1)?.token ?? "unreachable"));
	const token = invitations.find((item) => item.email === bob.email)?.token;
	assert.ok(token);

	const wrongUser = await call("/invitations/accept", { method: "POST", headers: carol.headers, body: { token } });
	assert.ok([400, 403, 404].includes(wrongUser.status));
	const accepted = await call("/invitations/accept", { method: "POST", headers: bob.headers, body: { token } });
	assert.equal(accepted.status, 200);
	const replay = await call("/invitations/accept", { method: "POST", headers: bob.headers, body: { token } });
	assert.ok(replay.status >= 400);

	assert.equal((await call(`/organizations/${orgId}`, { headers: bob.headers })).status, 200);
	assert.equal((await call(`/organizations/${orgId}`, { method: "PATCH", headers: bob.headers, body: { name: "Hijack" } })).status, 403);
	assert.equal((await call(`/organizations/${orgId}/invitations`, { headers: bob.headers })).status, 403);

	const visibleBefore = await call(`/organizations/${orgId}/applications`, { headers: bob.headers });
	assert.equal(visibleBefore.body.data.applications.length, 0);
	assert.equal((await call(`/organizations/${orgId}/applications/${appId}`, { headers: bob.headers })).status, 404);

	const added = await call(`/organizations/${orgId}/applications/${appId}/members`, {
		method: "POST",
		headers: alice.headers,
		body: { userId: bob.id, role: "MEMBER" },
	});
	assert.equal(added.status, 201);
	assert.equal((await call(`/organizations/${orgId}/applications/${appId}`, { headers: bob.headers })).status, 200);
	assert.equal((await call(`/organizations/${orgId}/applications/${appId}/api-keys`, { headers: bob.headers })).status, 403);

	const lastOwner = await call(`/organizations/${orgId}/members/${alice.id}`, { method: "DELETE", headers: alice.headers });
	assert.ok(lastOwner.status >= 400);
	const demote = await call(`/organizations/${orgId}/members/${alice.id}`, { method: "PATCH", headers: alice.headers, body: { role: "ADMIN" } });
	assert.ok(demote.status >= 400);

	const keyBase = `/organizations/${orgId}/applications/${appId}/api-keys`;
	const key = await call(keyBase, { method: "POST", headers: alice.headers, body: { name: "Backend", scopes: ["chat"] } });
	assert.equal(key.status, 201);
	assert.equal(key.headers.get("cache-control"), "no-store");
	const secret = key.body.data.key as string;
	const keyId = key.body.data.apiKey.id as string;
	assert.match(secret, /^sak_/);

	const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: keyId } });
	assert.notEqual(stored.keyHash, secret);
	assert.ok(!JSON.stringify(await call(keyBase, { headers: alice.headers })).includes(secret));

	const service = (value: string) => call("/service/application", { headers: { Authorization: `Bearer ${value}` } });
	const identity = await service(secret);
	assert.equal(identity.status, 200);
	assert.equal(identity.body.data.application.id, appId);
	assert.equal((await service(`${secret}x`)).status, 401);
	assert.equal((await call("/service/application", { headers: { "X-API-Key": secret } })).status, 200);

	const rotated = await call(`${keyBase}/${keyId}/rotate`, { method: "POST", headers: alice.headers, body: { graceHours: 1 } });
	assert.equal(rotated.status, 201);
	const nextSecret = rotated.body.data.key as string;
	assert.notEqual(nextSecret, secret);
	assert.equal((await service(secret)).status, 200);
	assert.equal((await service(nextSecret)).status, 200);

	await prisma.apiKey.update({ where: { id: keyId }, data: { expiresAt: new Date(Date.now() - 1000) } });
	assert.equal((await service(secret)).status, 401);
	assert.equal((await service(nextSecret)).status, 200);

	const nextId = rotated.body.data.apiKey.id as string;
	assert.equal((await call(`${keyBase}/${nextId}`, { method: "DELETE", headers: alice.headers })).status, 200);
	assert.equal((await service(nextSecret)).status, 401);
	assert.equal((await call(`${keyBase}/${nextId}`, { method: "DELETE", headers: alice.headers })).status, 404);

	const another = await call(keyBase, { method: "POST", headers: alice.headers, body: { name: "Second", scopes: ["chat"] } });
	const anotherSecret = another.body.data.key as string;
	assert.equal((await service(anotherSecret)).status, 200);
	assert.equal((await call(`/organizations/${orgId}/applications/${appId}`, { method: "DELETE", headers: alice.headers })).status, 200);
	assert.equal((await service(anotherSecret)).status, 401);

	assert.equal((await call(`/organizations/${orgId}`, { method: "DELETE", headers: alice.headers })).status, 200);
	assert.equal((await call(`/organizations/${orgId}`, { headers: alice.headers })).status, 404);
	assert.equal((await call(`/organizations/${orgId}`, { headers: bob.headers })).status, 404);
});
