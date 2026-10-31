import assert from "node:assert/strict";
import { test } from "node:test";

import { ForbiddenError, NotFoundError } from "../src/foundation/errors/app-error.js";
import { applicationPolicy, organizationPolicy, type ApplicationAction, type OrganizationAction } from "../src/modules/tenancy/policies.js";
import type {
	ApplicationAccessRecord,
	IAccessRepository,
	OrganizationMembershipRecord,
} from "../src/modules/tenancy/repositories/access.repository.interface.js";
import { RoleAuthorizer } from "../src/modules/tenancy/services/authorizer.service.js";
import type { TenantMembershipStatus, TenantRole } from "../src/modules/tenancy/tenancy.types.js";

const roles: TenantRole[] = ["MEMBER", "ADMIN", "OWNER"];

function membership(role: TenantRole, status: TenantMembershipStatus = "ACTIVE", archived: Date | null = null): OrganizationMembershipRecord {
	return { role, status, organizationArchivedAt: archived };
}

function applicationRecord(overrides: Partial<ApplicationAccessRecord> = {}): ApplicationAccessRecord {
	return {
		archivedAt: null,
		organizationArchivedAt: null,
		organizationRole: "MEMBER",
		organizationStatus: "ACTIVE",
		applicationRole: null,
		applicationStatus: null,
		...overrides,
	};
}

function authorizer(overrides: Partial<IAccessRepository> = {}): RoleAuthorizer {
	return new RoleAuthorizer({
		accessRepository: {
			findOrganizationMembership: async () => null,
			findApplicationAccess: async () => null,
			...overrides,
		},
	});
}

const rank: Record<TenantRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

test("organization actions are allowed exactly from their minimum role upwards", async () => {
	for (const [action, minimum] of Object.entries(organizationPolicy) as Array<[OrganizationAction, TenantRole]>) {
		for (const role of roles) {
			const subject = authorizer({ findOrganizationMembership: async () => membership(role) });
			const attempt = subject.organization("user-1", "org-1", action);
			if (rank[role] >= rank[minimum]) {
				assert.deepEqual(await attempt, { organizationId: "org-1", role }, `${role} should be allowed ${action}`);
			} else {
				await assert.rejects(attempt, ForbiddenError, `${role} should be denied ${action}`);
			}
		}
	}
});

test("non-members, inactive members and archived organizations look like they do not exist", async () => {
	const cases: Array<OrganizationMembershipRecord | null> = [
		null,
		membership("OWNER", "INVITED"),
		membership("OWNER", "SUSPENDED"),
		membership("OWNER", "REMOVED"),
		membership("OWNER", "ACTIVE", new Date()),
	];
	for (const found of cases) {
		const subject = authorizer({ findOrganizationMembership: async () => found });
		await assert.rejects(subject.organization("user-1", "org-1", "organization.read"), NotFoundError);
	}
});

test("organization admins and owners can perform every application action", async () => {
	for (const role of ["ADMIN", "OWNER"] as const) {
		const subject = authorizer({ findApplicationAccess: async () => applicationRecord({ organizationRole: role }) });
		for (const action of Object.keys(applicationPolicy) as ApplicationAction[]) {
			const access = await subject.application("user-1", "org-1", "app-1", action);
			assert.equal(access.viaOrganization, true);
			assert.equal(access.role, role);
		}
	}
});

test("plain organization members need an active application membership", async () => {
	const none = authorizer({ findApplicationAccess: async () => applicationRecord() });
	await assert.rejects(none.application("user-1", "org-1", "app-1", "application.read"), NotFoundError);

	const invited = authorizer({
		findApplicationAccess: async () => applicationRecord({ applicationRole: "ADMIN", applicationStatus: "INVITED" }),
	});
	await assert.rejects(invited.application("user-1", "org-1", "app-1", "application.read"), NotFoundError);
});

test("application members are limited by their application role", async () => {
	const member = authorizer({
		findApplicationAccess: async () => applicationRecord({ applicationRole: "MEMBER", applicationStatus: "ACTIVE" }),
	});
	assert.equal((await member.application("user-1", "org-1", "app-1", "application.read")).role, "MEMBER");
	assert.equal((await member.application("user-1", "org-1", "app-1", "application.member.read")).viaOrganization, false);
	for (const action of ["application.update", "api-key.manage", "api-key.read", "application.member.manage"] as const) {
		await assert.rejects(member.application("user-1", "org-1", "app-1", action), ForbiddenError, action);
	}

	const admin = authorizer({
		findApplicationAccess: async () => applicationRecord({ applicationRole: "ADMIN", applicationStatus: "ACTIVE" }),
	});
	for (const action of ["application.update", "api-key.manage", "api-key.read", "application.member.manage"] as const) {
		assert.equal((await admin.application("user-1", "org-1", "app-1", action)).role, "ADMIN");
	}
});

test("archiving an application is an organization-level action even for application admins", async () => {
	const admin = authorizer({
		findApplicationAccess: async () => applicationRecord({ applicationRole: "ADMIN", applicationStatus: "ACTIVE" }),
	});
	await assert.rejects(admin.application("user-1", "org-1", "app-1", "application.archive"), ForbiddenError);
});

test("applications outside the organization, archived ones and removed members are not found", async () => {
	const cases: Array<ApplicationAccessRecord | null> = [
		null,
		applicationRecord({ archivedAt: new Date(), organizationRole: "OWNER" }),
		applicationRecord({ organizationArchivedAt: new Date(), organizationRole: "OWNER" }),
		applicationRecord({ organizationRole: null, organizationStatus: null, applicationRole: "ADMIN", applicationStatus: "ACTIVE" }),
		applicationRecord({ organizationRole: "OWNER", organizationStatus: "SUSPENDED" }),
	];
	for (const found of cases) {
		const subject = authorizer({ findApplicationAccess: async () => found });
		await assert.rejects(subject.application("user-1", "org-1", "app-1", "application.read"), NotFoundError);
	}
});
