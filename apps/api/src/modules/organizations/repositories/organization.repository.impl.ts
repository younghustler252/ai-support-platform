import type { PrismaClient } from "../../../generated/prisma/client.js";
import type {
	IOrganizationRepository,
	OrganizationView,
	OrganizationWithRole,
} from "./organization.repository.interface.js";

const organizationSelect = { id: true, name: true, slug: true, createdAt: true } as const;

export class OrganizationRepositoryImpl implements IOrganizationRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	createWithOwner(input: { name: string; slug: string; userId: string }): Promise<OrganizationView> {
		return this.deps.prisma.$transaction(async (tx) => {
			const organization = await tx.organization.create({
				data: { name: input.name, slug: input.slug, createdByUserId: input.userId },
				select: organizationSelect,
			});
			await tx.organizationMembership.create({
				data: { organizationId: organization.id, userId: input.userId, status: "ACTIVE", role: "OWNER" },
			});
			return organization;
		});
	}

	countOwnedBy(userId: string): Promise<number> {
		return this.deps.prisma.organizationMembership.count({
			where: { userId, role: "OWNER", status: "ACTIVE", organization: { archivedAt: null } },
		});
	}

	async listForUser(userId: string): Promise<OrganizationWithRole[]> {
		const memberships = await this.deps.prisma.organizationMembership.findMany({
			where: { userId, status: "ACTIVE", organization: { archivedAt: null } },
			select: { role: true, organization: { select: organizationSelect } },
			orderBy: { organization: { name: "asc" } },
		});
		return memberships.map((membership) => ({ ...membership.organization, role: membership.role }));
	}

	findById(id: string): Promise<OrganizationView | null> {
		return this.deps.prisma.organization.findFirst({ where: { id, archivedAt: null }, select: organizationSelect });
	}

	async update(id: string, data: { name: string }): Promise<OrganizationView | null> {
		const result = await this.deps.prisma.organization.updateMany({
			where: { id, archivedAt: null },
			data: { name: data.name },
		});
		if (result.count === 0) return null;
		return this.findById(id);
	}

	archive(id: string): Promise<boolean> {
		return this.deps.prisma.$transaction(async (tx) => {
			const now = new Date();
			const result = await tx.organization.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: now } });
			if (result.count === 0) return false;
			await tx.invitation.updateMany({
				where: { organizationId: id, acceptedAt: null, revokedAt: null },
				data: { revokedAt: now },
			});
			return true;
		});
	}
}
