import assert from "node:assert/strict";
import test from "node:test";

import { AuditRepositoryImpl } from "../src/modules/audit/repositories/audit.repository.impl.js";
import { listAuditLogsQuerySchema } from "../src/modules/audit/validators/audit.validator.js";

const org = "11111111-1111-4111-8111-111111111111";
const app = "22222222-2222-4222-8222-222222222222";

function fakePrisma(rows: Array<Record<string, unknown>> = []) {
	const created: Array<{ data: Record<string, unknown> }> = [];
	const queries: Array<Record<string, any>> = [];
	const prisma = {
		auditLog: {
			create: async (args: { data: Record<string, unknown> }) => void created.push(args),
			findMany: async (args: Record<string, any>) => {
				queries.push(args);
				return rows;
			},
		},
	};
	return { created, queries, repo: new AuditRepositoryImpl({ prisma: prisma as never }) };
}

function row(index: number) {
	return {
		id: `id-${index}`,
		action: "role.created",
		resourceType: "Role",
		resourceId: null,
		applicationId: null,
		actor: { id: "u", email: "a@example.com", displayName: null },
		metadata: null,
		createdAt: new Date(2026, 10, 1, 0, 0, index),
	};
}

test("audit writes lift valid tenant ids out of the metadata and ignore anything else", async () => {
	const { repo, created } = fakePrisma();
	await repo.create({ action: "role.created", resourceType: "Role", metadata: { organizationId: org, applicationId: app } });
	await repo.create({ action: "auth.login.success", resourceType: "User", metadata: { ip: "1.2.3.4" } });
	await repo.create({ action: "x", resourceType: "X", metadata: { organizationId: "not-a-uuid", applicationId: 5 } });

	assert.equal(created[0]?.data.organizationId, org);
	assert.equal(created[0]?.data.applicationId, app);
	assert.equal(created[1]?.data.organizationId, null);
	assert.equal(created[2]?.data.organizationId, null);
	assert.equal(created[2]?.data.applicationId, null);
});

test("listing is always scoped to the requested organization", async () => {
	const { repo, queries } = fakePrisma();
	await repo.list({ organizationId: org, limit: 10 });
	assert.equal(queries[0]?.where.organizationId, org);
	assert.equal(queries[0]?.take, 11);
	assert.deepEqual(queries[0]?.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
});

test("filters are passed through and the action filter is a prefix match", async () => {
	const { repo, queries } = fakePrisma();
	const from = new Date("2026-11-01T00:00:00Z");
	await repo.list({ organizationId: org, applicationId: app, actorUserId: org, action: "role.", from, limit: 5 });
	const where = queries[0]?.where;
	assert.equal(where.applicationId, app);
	assert.equal(where.actorUserId, org);
	assert.deepEqual(where.action, { startsWith: "role." });
	assert.equal(where.createdAt.gte, from);
});

test("a full page returns a cursor that continues strictly after the last row", async () => {
	const { repo, queries } = fakePrisma([row(3), row(2), row(1)]);
	const page = await repo.list({ organizationId: org, limit: 2 });
	assert.equal(page.items.length, 2);
	assert.ok(page.nextCursor);

	await repo.list({ organizationId: org, limit: 2, cursor: page.nextCursor as string });
	const clause = queries[1]?.where.AND[0].OR;
	assert.equal(clause.length, 2);
	assert.ok(clause[0].createdAt.lt instanceof Date);
	assert.equal(clause[1].id.lt, "id-2");

	const last = await fakePrisma([row(1)]).repo.list({ organizationId: org, limit: 2 });
	assert.equal(last.nextCursor, null);
});

test("the query validator accepts filters and rejects bad ones", () => {
	assert.ok(listAuditLogsQuerySchema.safeParse({ action: "role.", applicationId: app, from: "2026-11-01", to: "2026-11-02" }).success);
	for (const bad of [{ applicationId: "x" }, { action: "DROP TABLE" }, { from: "2026-11-03", to: "2026-11-02" }, { from: "nonsense" }]) {
		assert.equal(listAuditLogsQuerySchema.safeParse(bad).success, false, JSON.stringify(bad));
	}
});
