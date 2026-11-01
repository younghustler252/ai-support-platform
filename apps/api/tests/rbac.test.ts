import assert from "node:assert/strict";
import { test } from "node:test";

import { tenancyConfig } from "../src/config/tenancy.js";
import { ConflictError, ForbiddenError, LimitExceededError, NotFoundError, ValidationError } from "../src/foundation/errors/app-error.js";
import { findPermission, grantScopeFor, permissionCatalog, scopeCovers, systemRoles, widestScope } from "../src/modules/rbac/permission-catalog.js";
import type { AssignResult, RoleTarget, RoleView } from "../src/modules/rbac/rbac.types.js";
import type { IRoleRepository } from "../src/modules/rbac/repositories/role.repository.interface.js";
import { assertHolds } from "../src/modules/rbac/services/grant-guard.js";
import { resolveGrants } from "../src/modules/rbac/services/role-permissions.js";
import { AssignRoleUseCase } from "../src/modules/rbac/usecases/assign-role.usecase.js";
import { CreateRoleUseCase } from "../src/modules/rbac/usecases/create-role.usecase.js";
import { DeleteRoleUseCase } from "../src/modules/rbac/usecases/delete-role.usecase.js";
import { ListPermissionsUseCase } from "../src/modules/rbac/usecases/list-permissions.usecase.js";
import { UnassignRoleUseCase } from "../src/modules/rbac/usecases/unassign-role.usecase.js";
import { UpdateRoleUseCase } from "../src/modules/rbac/usecases/update-role.usecase.js";
import { createRoleSchema, updateRoleSchema } from "../src/modules/rbac/validators/role.validator.js";
import { applicationPolicy, organizationPolicy } from "../src/modules/tenancy/policies.js";
import { applicationGrants, organizationGrants } from "../src/modules/tenancy/services/effective-grants.js";
import { auditSpy } from "./helpers.js";

const orgTarget: RoleTarget = { realm: "ORGANIZATION", organizationId: "org-1" };
const appTarget: RoleTarget = { realm: "APPLICATION", organizationId: "org-1", applicationId: "app-1" };
const ownerGrants = organizationGrants("OWNER", []);
const adminGrants = organizationGrants("ADMIN", []);

function role(overrides: Partial<RoleView> = {}): RoleView {
	return {
		id: "role-1",
		key: null,
		name: "Support",
		description: null,
		realm: "ORGANIZATION",
		system: false,
		permissions: [{ code: "member.read", scope: "ORGANIZATION" }],
		assignedCount: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

function repository(overrides: Partial<IRoleRepository> = {}): IRoleRepository {
	return {
		list: async () => [],
		find: async () => null,
		countCustom: async () => 0,
		create: async (_target, input) => role({ name: input.name, permissions: input.permissions }),
		update: async () => null,
		remove: async () => false,
		listAssignments: async () => [],
		assign: async () => "assigned",
		unassign: async () => false,
		...overrides,
	};
}

test("every catalog permission is backed by a policy rule and has a unique code", () => {
	const codes = permissionCatalog.map((definition) => definition.code);
	assert.equal(new Set(codes).size, codes.length);
	assert.equal(codes.length, Object.keys(organizationPolicy).length + Object.keys(applicationPolicy).length);
	assert.equal(findPermission("organization.archive")?.delegable, false);
	assert.equal(findPermission("application.archive")?.delegable, false);
	assert.equal(findPermission("role.manage")?.delegable, true);
});

test("scope coverage follows the hierarchy from OWN up to ALL", () => {
	assert.equal(scopeCovers("ALL", "ORGANIZATION"), true);
	assert.equal(scopeCovers("ORGANIZATION", "APPLICATION"), true);
	assert.equal(scopeCovers("APPLICATION", "APPLICATION"), true);
	assert.equal(scopeCovers("APPLICATION", "ORGANIZATION"), false);
	assert.equal(scopeCovers("OWN", "APPLICATION"), false);
	assert.equal(scopeCovers(undefined, "OWN"), false);
	assert.equal(widestScope("OWN", "TEAM"), "TEAM");
	assert.equal(widestScope(undefined, "OWN"), "OWN");
	assert.equal(widestScope("ALL", undefined), "ALL");
});

test("role realms decide which scope a permission can be granted at", () => {
	const orgPermission = findPermission("member.read")!;
	const appPermission = findPermission("api-key.manage")!;
	assert.equal(grantScopeFor("ORGANIZATION", orgPermission), "ORGANIZATION");
	assert.equal(grantScopeFor("ORGANIZATION", appPermission), "ORGANIZATION");
	assert.equal(grantScopeFor("APPLICATION", appPermission), "APPLICATION");
	assert.equal(grantScopeFor("APPLICATION", orgPermission), null);
});

test("default roles mirror the built-in tiers and are keyed uniquely", () => {
	assert.equal(new Set(systemRoles.map((item) => item.key)).size, systemRoles.length);
	const owner = systemRoles.find((item) => item.key === "organization-owner")!;
	const member = systemRoles.find((item) => item.key === "organization-member")!;
	assert.ok(owner.permissions.some((grant) => grant.code === "organization.archive"));
	assert.ok(!member.permissions.some((grant) => grant.code === "organization.update"));
	assert.ok(member.permissions.some((grant) => grant.code === "organization.read"));
	const appMember = systemRoles.find((item) => item.key === "application-member")!;
	assert.ok(appMember.permissions.every((grant) => grant.scope === "APPLICATION"));
	assert.ok(!appMember.permissions.some((grant) => grant.code === "api-key.manage"));
});

test("built-in tiers produce the same effective permissions the old role checks gave", () => {
	const member = organizationGrants("MEMBER", []);
	assert.equal(member["organization.read"], "ORGANIZATION");
	assert.equal(member["organization.update"], undefined);
	assert.equal(member["application.read"], undefined);

	assert.equal(adminGrants["organization.update"], "ORGANIZATION");
	assert.equal(adminGrants["organization.archive"], undefined);
	assert.equal(adminGrants["api-key.manage"], "ORGANIZATION");
	assert.equal(ownerGrants["organization.archive"], "ORGANIZATION");

	const appAdmin = applicationGrants({ organizationRole: "MEMBER", organizationCustom: [], applicationRole: "ADMIN", applicationCustom: [] });
	assert.equal(appAdmin["api-key.manage"], "APPLICATION");
	assert.equal(appAdmin["application.archive"], undefined);
	assert.equal(appAdmin["organization.read"], undefined);

	const none = applicationGrants({ organizationRole: "MEMBER", organizationCustom: [], applicationRole: null, applicationCustom: [] });
	assert.deepEqual(none, {});
});

test("custom grants add to the tier and organization-level grants reach every application", () => {
	const withRole = organizationGrants("MEMBER", [{ code: "member.manage", scope: "ORGANIZATION" }, { code: "bogus.permission", scope: "ALL" }]);
	assert.equal(withRole["member.manage"], "ORGANIZATION");
	assert.equal(withRole["bogus.permission"], undefined);

	const orgWide = applicationGrants({
		organizationRole: "MEMBER",
		organizationCustom: [{ code: "api-key.read", scope: "ORGANIZATION" }],
		applicationRole: null,
		applicationCustom: [],
	});
	assert.equal(orgWide["api-key.read"], "ORGANIZATION");
	assert.equal(orgWide["api-key.manage"], undefined);

	const appLevel = applicationGrants({
		organizationRole: "MEMBER",
		organizationCustom: [],
		applicationRole: "MEMBER",
		applicationCustom: [{ code: "api-key.read", scope: "APPLICATION" }, { code: "member.manage", scope: "APPLICATION" }],
	});
	assert.equal(appLevel["api-key.read"], "APPLICATION");
	assert.equal(appLevel["member.manage"], undefined);
});

test("holding a permission at a narrower scope does not allow granting it wider", () => {
	assert.doesNotThrow(() => assertHolds(adminGrants, [{ code: "member.read", scope: "ORGANIZATION" }]));
	assert.throws(() => assertHolds(adminGrants, [{ code: "organization.archive", scope: "ORGANIZATION" }]), ForbiddenError);
	assert.throws(
		() => assertHolds({ "api-key.read": "APPLICATION" }, [{ code: "api-key.read", scope: "ORGANIZATION" }]),
		ForbiddenError,
	);
});

test("permission codes are validated against the catalog, the realm and delegability", () => {
	assert.deepEqual(resolveGrants(orgTarget, ["role.read", "member.read", "role.read"]).map((grant) => grant.code), ["member.read", "role.read"]);
	assert.throws(() => resolveGrants(orgTarget, ["nope.nope"]), ValidationError);
	assert.throws(() => resolveGrants(orgTarget, ["organization.archive"]), ValidationError);
	assert.throws(() => resolveGrants(appTarget, ["organization.update"]), ValidationError);
	assert.equal(resolveGrants(appTarget, ["api-key.read"])[0]?.scope, "APPLICATION");
	assert.equal(resolveGrants(orgTarget, ["api-key.read"])[0]?.scope, "ORGANIZATION");
});

test("the permission list only offers what the target realm can grant", () => {
	const list = new ListPermissionsUseCase();
	const organization = list.execute(orgTarget).map((item) => item.code);
	const application = list.execute(appTarget).map((item) => item.code);
	assert.ok(organization.includes("member.read"));
	assert.ok(!organization.includes("organization.archive"));
	assert.ok(application.includes("api-key.manage"));
	assert.ok(!application.includes("member.read"));
	assert.ok(!application.includes("application.archive"));
});

test("creating a role checks the escalation guard, the limit and duplicate names", async () => {
	const audit = auditSpy();
	const created: string[] = [];
	const useCase = (repo: IRoleRepository) => new CreateRoleUseCase({ roleRepository: repo, auditService: audit });
	const base = { target: orgTarget, actor: { id: "user-1", grants: adminGrants }, name: "Support", permissions: ["member.read"] };

	const repo = repository({ create: async (_t, input) => { created.push(input.name); return role({ name: input.name }); } });
	await useCase(repo).execute(base);
	assert.deepEqual(created, ["Support"]);
	assert.equal(audit.events[0]?.action, "role.created");

	await assert.rejects(useCase(repo).execute({ ...base, permissions: ["organization.archive"] }), ValidationError);
	await assert.rejects(
		useCase(repo).execute({ ...base, actor: { id: "user-2", grants: { "role.manage": "ORGANIZATION" } }, permissions: ["member.manage"] }),
		ForbiddenError,
	);
	await assert.rejects(
		useCase(repository({ countCustom: async () => tenancyConfig.limits.customRolesPerScope })).execute(base),
		LimitExceededError,
	);
	await assert.rejects(
		useCase(repository({ create: async () => { throw Object.assign(new Error("dup"), { code: "P2002" }); } })).execute(base),
		ConflictError,
	);
});

test("default roles can never be changed, deleted or assigned", async () => {
	const system = repository({ find: async () => role({ system: true, key: "organization-admin" }) });
	const actor = { id: "user-1", grants: ownerGrants };
	const audit = auditSpy();

	await assert.rejects(new UpdateRoleUseCase({ roleRepository: system, auditService: audit }).execute({ target: orgTarget, actor, roleId: "r", patch: { name: "X" } }), ForbiddenError);
	await assert.rejects(new DeleteRoleUseCase({ roleRepository: system, auditService: audit }).execute({ target: orgTarget, actor, roleId: "r" }), ForbiddenError);
	await assert.rejects(new AssignRoleUseCase({ roleRepository: system, auditService: audit }).execute({ target: orgTarget, actor, roleId: "r", userId: "u" }), ForbiddenError);
	await assert.rejects(new UnassignRoleUseCase({ roleRepository: system, auditService: audit }).execute({ target: orgTarget, actor, roleId: "r", userId: "u" }), ForbiddenError);
	assert.equal(audit.events.length, 0);
});

test("updating or deleting a role needs every permission it already holds", async () => {
	const powerful = repository({
		find: async () => role({ permissions: [{ code: "organization.update", scope: "ORGANIZATION" }, { code: "role.manage", scope: "ORGANIZATION" }] }),
		update: async () => role(),
		remove: async () => true,
	});
	const lowly = { id: "user-2", grants: { "role.manage": "ORGANIZATION" } as const };
	const audit = auditSpy();

	await assert.rejects(new UpdateRoleUseCase({ roleRepository: powerful, auditService: audit }).execute({ target: orgTarget, actor: lowly, roleId: "r", patch: { name: "Renamed" } }), ForbiddenError);
	await assert.rejects(new DeleteRoleUseCase({ roleRepository: powerful, auditService: audit }).execute({ target: orgTarget, actor: lowly, roleId: "r" }), ForbiddenError);

	const ok = await new DeleteRoleUseCase({ roleRepository: powerful, auditService: audit }).execute({ target: orgTarget, actor: { id: "owner", grants: ownerGrants }, roleId: "r" });
	assert.deepEqual(ok, { deleted: true });
	assert.equal(audit.events.at(-1)?.action, "role.deleted");
});

test("updating a role validates new permissions and maps duplicate names", async () => {
	const audit = auditSpy();
	const actor = { id: "user-1", grants: adminGrants };
	const existing = repository({ find: async () => role(), update: async (_t, _id, patch) => role({ name: patch.name ?? "Support" }) });

	const updated = await new UpdateRoleUseCase({ roleRepository: existing, auditService: audit }).execute({ target: orgTarget, actor, roleId: "r", patch: { name: "Agents", permissions: ["member.read", "role.read"] } });
	assert.equal(updated.name, "Agents");
	assert.equal(audit.events[0]?.action, "role.updated");

	await assert.rejects(new UpdateRoleUseCase({ roleRepository: existing, auditService: audit }).execute({ target: orgTarget, actor, roleId: "r", patch: { permissions: ["organization.archive"] } }), ValidationError);

	const duplicate = repository({ find: async () => role(), update: async () => { throw Object.assign(new Error("dup"), { code: "P2002" }); } });
	await assert.rejects(new UpdateRoleUseCase({ roleRepository: duplicate, auditService: audit }).execute({ target: orgTarget, actor, roleId: "r", patch: { name: "Taken" } }), ConflictError);

	const gone = repository({ find: async () => role(), update: async () => null });
	await assert.rejects(new UpdateRoleUseCase({ roleRepository: gone, auditService: audit }).execute({ target: orgTarget, actor, roleId: "r", patch: { name: "Late" } }), NotFoundError);
});

test("assignment maps repository outcomes and is idempotent", async () => {
	const actor = { id: "admin", grants: adminGrants };
	const run = async (result: AssignResult, audit = auditSpy()) => {
		const useCase = new AssignRoleUseCase({
			roleRepository: repository({ find: async () => role(), assign: async () => result }),
			auditService: audit,
		});
		return { outcome: useCase.execute({ target: orgTarget, actor, roleId: "r", userId: "u" }), audit };
	};

	const assigned = await run("assigned");
	assert.deepEqual(await assigned.outcome, { assigned: true });
	assert.equal(assigned.audit.events[0]?.action, "role.assigned");

	const already = await run("already");
	assert.deepEqual(await already.outcome, { assigned: true });
	assert.equal(already.audit.events.length, 0);

	await assert.rejects((await run("not-member")).outcome, NotFoundError);
	await assert.rejects((await run("role-missing")).outcome, NotFoundError);
	await assert.rejects((await run("limit")).outcome, LimitExceededError);

	const lowly = new AssignRoleUseCase({
		roleRepository: repository({ find: async () => role({ permissions: [{ code: "organization.update", scope: "ORGANIZATION" }] }) }),
		auditService: auditSpy(),
	});
	await assert.rejects(lowly.execute({ target: orgTarget, actor: { id: "x", grants: { "role.assign": "ORGANIZATION" } }, roleId: "r", userId: "u" }), ForbiddenError);
});

test("unassigning reports missing assignments and audits removals", async () => {
	const actor = { id: "admin", grants: adminGrants };
	const audit = auditSpy();
	const missing = new UnassignRoleUseCase({ roleRepository: repository({ find: async () => role() }), auditService: audit });
	await assert.rejects(missing.execute({ target: orgTarget, actor, roleId: "r", userId: "u" }), NotFoundError);

	const present = new UnassignRoleUseCase({ roleRepository: repository({ find: async () => role(), unassign: async () => true }), auditService: audit });
	assert.deepEqual(await present.execute({ target: appTarget, actor, roleId: "r", userId: "u" }), { unassigned: true });
	assert.equal(audit.events[0]?.action, "role.unassigned");
	assert.equal(audit.events[0]?.metadata?.applicationId, "app-1");
});

test("role bodies are strict, bounded and de-duplicated", () => {
	const parsed = createRoleSchema.parse({ name: " Support ", permissions: ["member.read", "member.read"] });
	assert.equal(parsed.name, "Support");
	assert.deepEqual(parsed.permissions, ["member.read", "member.read"]);
	assert.equal(createRoleSchema.safeParse({ name: "Support", permissions: [{ code: "conversation.read", scope: "ASSIGNED" }] }).success, true);
	assert.equal(createRoleSchema.safeParse({ name: "Support", permissions: [{ code: "conversation.read", scope: "ALL" }] }).success, false);
	assert.equal(createRoleSchema.safeParse({ name: "x", permissions: ["member.read"] }).success, false);
	assert.equal(createRoleSchema.safeParse({ name: "Support", permissions: [] }).success, false);
	assert.equal(createRoleSchema.safeParse({ name: "Support", permissions: ["member.read"], realm: "APPLICATION" }).success, false);
	assert.equal(updateRoleSchema.safeParse({}).success, false);
	assert.equal(updateRoleSchema.safeParse({ description: null }).success, true);
});

test("narrow scopes are only accepted for permissions that support them", () => {
	const narrow = resolveGrants(appTarget, [{ code: "conversation.read", scope: "ASSIGNED" }]);
	assert.deepEqual(narrow, [{ code: "conversation.read", scope: "ASSIGNED" }]);
	assert.deepEqual(resolveGrants(appTarget, ["conversation.read"]), [{ code: "conversation.read", scope: "APPLICATION" }]);
	assert.deepEqual(resolveGrants(orgTarget, ["conversation.read"]), [{ code: "conversation.read", scope: "ORGANIZATION" }]);
	assert.deepEqual(resolveGrants(orgTarget, [{ code: "conversation.reply", scope: "ASSIGNED" }]), [{ code: "conversation.reply", scope: "ASSIGNED" }]);
	assert.throws(() => resolveGrants(appTarget, [{ code: "customer.read", scope: "ASSIGNED" }]), ValidationError);
	assert.throws(() => resolveGrants(appTarget, [{ code: "conversation.read", scope: "OWN" }]), ValidationError);
	assert.deepEqual(
		resolveGrants(appTarget, [{ code: "conversation.read", scope: "ASSIGNED" }, "conversation.read"]),
		[{ code: "conversation.read", scope: "APPLICATION" }],
	);
});

test("support permissions start at application scope for members and routes accept assigned-only grants", () => {
	const member = applicationGrants({ organizationRole: "MEMBER", organizationCustom: [], applicationRole: "MEMBER", applicationCustom: [] });
	assert.equal(member["conversation.read"], "APPLICATION");
	assert.equal(member["conversation.claim"], "APPLICATION");
	assert.equal(member["conversation.assign"], undefined);
	assert.equal(member["customer.manage"], undefined);

	assert.equal(findPermission("conversation.read")?.requiredScope, "ASSIGNED");
	assert.equal(findPermission("conversation.claim")?.requiredScope, "APPLICATION");
	assert.equal(scopeCovers("ASSIGNED", findPermission("conversation.read")!.requiredScope), true);
	assert.equal(scopeCovers("ASSIGNED", findPermission("conversation.claim")!.requiredScope), false);
});
