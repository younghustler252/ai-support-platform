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
const emails: string[] = [];

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

	container.register({ authEmailService: asValue(mailbox), auditService: asValue(auditSpy()) });

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

test("custom roles grant extra permissions without ever exceeding what the grantor holds", { skip }, async () => {
	const alice = await signUp("alice");
	const bob = await signUp("bob");
	const carol = await signUp("carol");

	const orgId = (await call("/organizations", { method: "POST", headers: alice.headers, body: { name: `Roles ${run}` } })).body.data.organization.id as string;
	const appId = (await call(`/organizations/${orgId}/applications`, { method: "POST", headers: alice.headers, body: { name: "Web" } })).body.data.application.id as string;
	await prisma.organizationMembership.create({ data: { organizationId: orgId, userId: bob.id, status: "ACTIVE", role: "MEMBER" } });

	const carolOrg = (await call("/organizations", { method: "POST", headers: carol.headers, body: { name: `Carols ${run}` } })).body.data.organization.id as string;

	const listed = await call(`/organizations/${orgId}/roles`, { headers: alice.headers });
	assert.equal(listed.status, 200);
	const system = listed.body.data.roles.filter((item: { system: boolean }) => item.system);
	assert.deepEqual(system.map((item: { name: string }) => item.name).sort(), ["Admin", "Member", "Owner"]);
	assert.equal((await call(`/organizations/${orgId}/roles`, { headers: bob.headers })).status, 403);

	const systemId = system[0].id as string;
	assert.equal((await call(`/organizations/${orgId}/roles/${systemId}`, { method: "PATCH", headers: alice.headers, body: { name: "Hacked" } })).status, 403);
	assert.equal((await call(`/organizations/${orgId}/roles/${systemId}`, { method: "DELETE", headers: alice.headers })).status, 403);

	const bad = await call(`/organizations/${orgId}/roles`, { method: "POST", headers: alice.headers, body: { name: "Bad", permissions: ["organization.archive"] } });
	assert.equal(bad.status, 400);
	const unknown = await call(`/organizations/${orgId}/roles`, { method: "POST", headers: alice.headers, body: { name: "Bad", permissions: ["made.up"] } });
	assert.equal(unknown.status, 400);

	const auditor = await call(`/organizations/${orgId}/roles`, {
		method: "POST",
		headers: alice.headers,
		body: { name: "Auditor", description: "Read access", permissions: ["role.read", "application.read", "application.list"] },
	});
	assert.equal(auditor.status, 201);
	const auditorId = auditor.body.data.role.id as string;
	assert.equal((await call(`/organizations/${orgId}/roles`, { method: "POST", headers: alice.headers, body: { name: "auditor", permissions: ["role.read"] } })).status, 409);

	assert.equal((await call(`/organizations/${orgId}/applications/${appId}`, { headers: bob.headers })).status, 404);
	assert.equal((await call(`/organizations/${orgId}/roles/${auditorId}/members/${bob.id}`, { method: "PUT", headers: alice.headers })).status, 200);
	assert.equal((await call(`/organizations/${orgId}/roles/${auditorId}/members/${bob.id}`, { method: "PUT", headers: alice.headers })).status, 200);
	assert.equal((await call(`/organizations/${orgId}/roles/${auditorId}/members/${carol.id}`, { method: "PUT", headers: alice.headers })).status, 404);

	const assignments = await call(`/organizations/${orgId}/roles/${auditorId}/members`, { headers: alice.headers });
	assert.deepEqual(assignments.body.data.members.map((item: { userId: string }) => item.userId), [bob.id]);

	assert.equal((await call(`/organizations/${orgId}/roles`, { headers: bob.headers })).status, 200);
	const visible = await call(`/organizations/${orgId}/applications`, { headers: bob.headers });
	assert.deepEqual(visible.body.data.applications.map((item: { id: string }) => item.id), [appId]);
	assert.equal((await call(`/organizations/${orgId}/applications/${appId}`, { headers: bob.headers })).status, 200);
	assert.equal((await call(`/organizations/${orgId}/applications/${appId}`, { method: "PATCH", headers: bob.headers, body: { name: "Nope" } })).status, 403);
	assert.equal((await call(`/organizations/${orgId}/roles`, { method: "POST", headers: bob.headers, body: { name: "Mine", permissions: ["role.read"] } })).status, 403);

	const power = await call(`/organizations/${orgId}/roles`, {
		method: "POST",
		headers: alice.headers,
		body: { name: "Power", permissions: ["member.manage", "role.read"] },
	});
	const powerId = power.body.data.role.id as string;
	const manager = await call(`/organizations/${orgId}/roles`, {
		method: "POST",
		headers: alice.headers,
		body: { name: "Role manager", permissions: ["role.read", "role.manage", "role.assign"] },
	});
	const managerId = manager.body.data.role.id as string;
	assert.equal((await call(`/organizations/${orgId}/roles/${managerId}/members/${bob.id}`, { method: "PUT", headers: alice.headers })).status, 200);

	const escalate = await call(`/organizations/${orgId}/roles`, { method: "POST", headers: bob.headers, body: { name: "Escalate", permissions: ["organization.update"] } });
	assert.equal(escalate.status, 403);
	assert.equal((await call(`/organizations/${orgId}/roles/${powerId}/members/${bob.id}`, { method: "PUT", headers: bob.headers })).status, 403);
	assert.equal((await call(`/organizations/${orgId}/roles/${powerId}`, { method: "DELETE", headers: bob.headers })).status, 403);
	assert.equal((await call(`/organizations/${orgId}/roles/${powerId}`, { method: "PATCH", headers: bob.headers, body: { name: "Mine now" } })).status, 403);

	const own = await call(`/organizations/${orgId}/roles`, { method: "POST", headers: bob.headers, body: { name: "Bobs role", permissions: ["role.read"] } });
	assert.equal(own.status, 201);

	assert.equal((await call(`/organizations/${carolOrg}/roles/${auditorId}`, { headers: carol.headers })).status, 404);
	assert.equal((await call(`/organizations/${orgId}/roles`, { headers: carol.headers })).status, 404);
	assert.equal((await call(`/organizations/${carolOrg}/roles/${auditorId}/members/${carol.id}`, { method: "PUT", headers: carol.headers })).status, 404);

	assert.equal((await call(`/organizations/${orgId}/roles/${auditorId}`, { method: "DELETE", headers: alice.headers })).status, 200);
	assert.equal((await call(`/organizations/${orgId}/applications/${appId}`, { headers: bob.headers })).status, 404);
	assert.equal((await call(`/organizations/${orgId}/roles/${auditorId}`, { headers: alice.headers })).status, 404);

	assert.equal((await call(`/organizations/${orgId}/applications/${appId}/members`, { method: "POST", headers: alice.headers, body: { userId: bob.id, role: "MEMBER" } })).status, 201);
	const appBad = await call(`/organizations/${orgId}/applications/${appId}/roles`, { method: "POST", headers: alice.headers, body: { name: "Bad", permissions: ["member.read"] } });
	assert.equal(appBad.status, 400);
	const appRole = await call(`/organizations/${orgId}/applications/${appId}/roles`, { method: "POST", headers: alice.headers, body: { name: "Key reader", permissions: ["api-key.read"] } });
	assert.equal(appRole.status, 201);
	const appRoleId = appRole.body.data.role.id as string;
	const keysUrl = `/organizations/${orgId}/applications/${appId}/api-keys`;
	assert.equal((await call(keysUrl, { headers: bob.headers })).status, 403);
	assert.equal((await call(`/organizations/${orgId}/applications/${appId}/roles/${appRoleId}/members/${bob.id}`, { method: "PUT", headers: alice.headers })).status, 200);
	assert.equal((await call(keysUrl, { headers: bob.headers })).status, 200);
	assert.equal((await call(keysUrl, { method: "POST", headers: bob.headers, body: { name: "k", scopes: ["chat"] } })).status, 403);
	assert.equal((await call(`/organizations/${orgId}/roles/${appRoleId}`, { headers: alice.headers })).status, 404);

	assert.equal((await call(`/organizations/${orgId}/applications/${appId}/roles/${appRoleId}/members/${bob.id}`, { method: "DELETE", headers: alice.headers })).status, 200);
	assert.equal((await call(keysUrl, { headers: bob.headers })).status, 403);
});
