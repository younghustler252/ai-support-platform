import type { PrismaClient } from "../../../generated/prisma/client.js";
import type {
	ApplicationAccessRecord,
	IAccessRepository,
	OrganizationMembershipRecord,
} from "./access.repository.interface.js";

export class AccessRepositoryImpl implements IAccessRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	async findOrganizationMembership(userId: string, organizationId: string): Promise<OrganizationMembershipRecord | null> {
		const membership = await this.deps.prisma.organizationMembership.findUnique({
			where: { organizationId_userId: { organizationId, userId } },
			select: { role: true, status: true, organization: { select: { archivedAt: true } } },
		});
		if (!membership) return null;
		return {
			role: membership.role,
			status: membership.status,
			organizationArchivedAt: membership.organization.archivedAt,
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
						memberships: { where: { userId }, select: { role: true, status: true }, take: 1 },
					},
				},
				members: { where: { userId }, select: { role: true, status: true }, take: 1 },
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
		};
	}
}
