import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { RoleGrant } from "../tenancy.types.js";
import type {
	ApplicationAccessRecord,
	IAccessRepository,
	OrganizationMembershipRecord,
} from "./access.repository.interface.js";

const roleGrantsSelect = {
	select: {
		role: {
			select: {
				permissions: { select: { scope: true, permission: { select: { code: true } } } },
			},
		},
	},
} as const;

interface GrantRows {
	role: { permissions: Array<{ scope: RoleGrant["scope"]; permission: { code: string } }> };
}

function toGrants(rows: GrantRows[] | undefined): RoleGrant[] {
	return (rows ?? []).flatMap((row) => row.role.permissions.map((item) => ({ code: item.permission.code, scope: item.scope })));
}

export class AccessRepositoryImpl implements IAccessRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	async findOrganizationMembership(userId: string, organizationId: string): Promise<OrganizationMembershipRecord | null> {
		const membership = await this.deps.prisma.organizationMembership.findUnique({
			where: { organizationId_userId: { organizationId, userId } },
			select: {
				role: true,
				status: true,
				organization: { select: { archivedAt: true } },
				roles: roleGrantsSelect,
			},
		});
		if (!membership) return null;
		return {
			role: membership.role,
			status: membership.status,
			organizationArchivedAt: membership.organization.archivedAt,
			grants: toGrants(membership.roles),
		};
	}

	async findApplicationAccess(
		userId: string,
		organizationId: string,
		applicationId: string,
	): Promise<ApplicationAccessRecord | null> {
		const application = await this.deps.prisma.application.findFirst({
			where: { id: applicationId, organizationId },
			select: {
				archivedAt: true,
				organization: {
					select: {
						archivedAt: true,
						memberships: { where: { userId }, select: { role: true, status: true, roles: roleGrantsSelect }, take: 1 },
					},
				},
				members: { where: { userId }, select: { role: true, status: true, roles: roleGrantsSelect }, take: 1 },
			},
		});
		if (!application) return null;

		const organizationMembership = application.organization.memberships[0];
		const applicationMembership = application.members[0];
		return {
			archivedAt: application.archivedAt,
			organizationArchivedAt: application.organization.archivedAt,
			organizationRole: organizationMembership?.role ?? null,
			organizationStatus: organizationMembership?.status ?? null,
			applicationRole: applicationMembership?.role ?? null,
			applicationStatus: applicationMembership?.status ?? null,
			organizationGrants: toGrants(organizationMembership?.roles),
			applicationGrants: applicationMembership?.status === "ACTIVE" ? toGrants(applicationMembership.roles) : [],
		};
	}
}
