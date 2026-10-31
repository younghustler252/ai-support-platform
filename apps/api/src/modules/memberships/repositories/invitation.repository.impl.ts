import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { TenantRole } from "../../tenancy/tenancy.types.js";
import type {
	IInvitationRepository,
	InvitationLookup,
	InvitationView,
	NewInvitation,
} from "./invitation.repository.interface.js";

const invitationSelect = {
	id: true,
	email: true,
	role: true,
	expiresAt: true,
	createdAt: true,
	invitedByUserId: true,
} as const;

export class InvitationRepositoryImpl implements IInvitationRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	create(input: NewInvitation): Promise<{ invitation: InvitationView; organizationName: string }> {
		return this.deps.prisma.$transaction(async (tx) => {
			await tx.invitation.updateMany({
				where: { organizationId: input.organizationId, email: input.email, acceptedAt: null, revokedAt: null },
				data: { revokedAt: new Date() },
			});
			const created = await tx.invitation.create({
				data: input,
				select: { ...invitationSelect, organization: { select: { name: true } } },
			});
			const { organization, ...invitation } = created;
			return { invitation, organizationName: organization.name };
		});
	}

	countPending(organizationId: string): Promise<number> {
		return this.deps.prisma.invitation.count({
			where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
		});
	}

	listPending(organizationId: string): Promise<InvitationView[]> {
		return this.deps.prisma.invitation.findMany({
			where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
			select: invitationSelect,
			orderBy: { createdAt: "desc" },
		});
	}

	async revoke(organizationId: string, invitationId: string): Promise<boolean> {
		const result = await this.deps.prisma.invitation.updateMany({
			where: { id: invitationId, organizationId, acceptedAt: null, revokedAt: null },
			data: { revokedAt: new Date() },
		});
		return result.count > 0;
	}

	async isActiveMemberEmail(organizationId: string, email: string): Promise<boolean> {
		const member = await this.deps.prisma.organizationMembership.findFirst({
			where: { organizationId, status: "ACTIVE", user: { email } },
			select: { id: true },
		});
		return member !== null;
	}

	async findByTokenHash(tokenHash: string): Promise<InvitationLookup | null> {
		const row = await this.deps.prisma.invitation.findUnique({
			where: { tokenHash },
			select: {
				id: true,
				organizationId: true,
				email: true,
				role: true,
				expiresAt: true,
				acceptedAt: true,
				revokedAt: true,
				organization: { select: { name: true, archivedAt: true } },
			},
		});
		if (!row) return null;
		return {
			id: row.id,
			organizationId: row.organizationId,
			organizationName: row.organization.name,
			organizationArchivedAt: row.organization.archivedAt,
			email: row.email,
			role: row.role,
			expiresAt: row.expiresAt,
			acceptedAt: row.acceptedAt,
			revokedAt: row.revokedAt,
		};
	}

	accept(input: { invitationId: string; organizationId: string; userId: string; role: TenantRole }): Promise<boolean> {
		return this.deps.prisma.$transaction(async (tx) => {
			const now = new Date();
			const claimed = await tx.invitation.updateMany({
				where: {
					id: input.invitationId,
					organizationId: input.organizationId,
					acceptedAt: null,
					revokedAt: null,
					expiresAt: { gt: now },
					organization: { archivedAt: null },
				},
				data: { acceptedAt: now },
			});
			if (claimed.count !== 1) return false;

			const existing = await tx.organizationMembership.findUnique({
				where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
				select: { id: true, status: true },
			});
			if (!existing) {
				await tx.organizationMembership.create({
					data: { organizationId: input.organizationId, userId: input.userId, status: "ACTIVE", role: input.role },
				});
			} else if (existing.status !== "ACTIVE") {
				await tx.organizationMembership.update({
					where: { id: existing.id },
					data: { status: "ACTIVE", role: input.role },
				});
			}
			return true;
		});
	}
}
