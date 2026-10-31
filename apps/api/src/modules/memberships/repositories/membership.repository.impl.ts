import type { PrismaClient } from "../../../generated/prisma/client.js";
import { isUniqueViolation } from "../../auth/auth.utils.js";
import type { TenantRole } from "../../tenancy/tenancy.types.js";
import type {
	AddApplicationMemberResult,
	ApplicationMemberView,
	IMembershipRepository,
	OrganizationMemberView,
	RemoveResult,
	RoleChangeResult,
} from "./membership.repository.interface.js";

const memberUserSelect = { id: true, email: true, displayName: true } as const;

export class MembershipRepositoryImpl implements IMembershipRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	async listOrganizationMembers(organizationId: string): Promise<OrganizationMemberView[]> {
		const rows = await this.deps.prisma.organizationMembership.findMany({
			where: { organizationId, status: "ACTIVE" },
			select: { role: true, createdAt: true, user: { select: memberUserSelect } },
			orderBy: { createdAt: "asc" },
		});
		return rows.map((row) => ({
			userId: row.user.id,
			email: row.user.email,
			displayName: row.user.displayName,
			role: row.role,
			joinedAt: row.createdAt,
		}));
	}

	async findOrganizationMember(organizationId: string, userId: string) {
		const row = await this.deps.prisma.organizationMembership.findFirst({
			where: { organizationId, userId, status: "ACTIVE" },
			select: { userId: true, role: true },
		});
		return row ?? null;
	}

	changeOrganizationMemberRole(organizationId: string, userId: string, role: TenantRole): Promise<RoleChangeResult> {
		return this.deps.prisma.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;

			const current = await tx.organizationMembership.findFirst({
				where: { organizationId, userId, status: "ACTIVE" },
				select: { id: true, role: true },
			});
			if (!current) return "not_found";

			if (current.role === "OWNER" && role !== "OWNER") {
				const owners = await tx.organizationMembership.count({
					where: { organizationId, role: "OWNER", status: "ACTIVE" },
				});
				if (owners <= 1) return "last_owner";
			}

			await tx.organizationMembership.update({ where: { id: current.id }, data: { role } });
			return "updated";
		});
	}

	removeOrganizationMember(organizationId: string, userId: string): Promise<RemoveResult> {
		return this.deps.prisma.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;

			const current = await tx.organizationMembership.findFirst({
				where: { organizationId, userId, status: "ACTIVE" },
				select: { id: true, role: true },
			});
			if (!current) return "not_found";

			if (current.role === "OWNER") {
				const owners = await tx.organizationMembership.count({
					where: { organizationId, role: "OWNER", status: "ACTIVE" },
				});
				if (owners <= 1) return "last_owner";
			}

			await tx.applicationMembership.deleteMany({ where: { userId, application: { organizationId } } });
			await tx.organizationMembership.delete({ where: { id: current.id } });
			return "removed";
		});
	}

	async listApplicationMembers(organizationId: string, applicationId: string): Promise<ApplicationMemberView[]> {
		const rows = await this.deps.prisma.applicationMembership.findMany({
			where: { applicationId, status: "ACTIVE", application: { organizationId, archivedAt: null } },
			select: { role: true, createdAt: true, user: { select: memberUserSelect } },
			orderBy: { createdAt: "asc" },
		});
		return rows.map((row) => ({
			userId: row.user.id,
			email: row.user.email,
			displayName: row.user.displayName,
			role: row.role,
			addedAt: row.createdAt,
		}));
	}

	async addApplicationMember(
		organizationId: string,
		applicationId: string,
		userId: string,
		role: TenantRole,
	): Promise<AddApplicationMemberResult> {
		try {
			return await this.deps.prisma.$transaction(async (tx): Promise<AddApplicationMemberResult> => {
				const application = await tx.application.findFirst({
					where: { id: applicationId, organizationId, archivedAt: null },
					select: { id: true },
				});
				if (!application) return "not_found";

				const organizationMember = await tx.organizationMembership.findFirst({
					where: { organizationId, userId, status: "ACTIVE" },
					select: { id: true },
				});
				if (!organizationMember) return "not_org_member";

				const existing = await tx.applicationMembership.findUnique({
					where: { applicationId_userId: { applicationId, userId } },
					select: { id: true, status: true },
				});
				if (existing?.status === "ACTIVE") return "exists";
				if (existing) {
					await tx.applicationMembership.update({ where: { id: existing.id }, data: { status: "ACTIVE", role } });
					return "added";
				}

				await tx.applicationMembership.create({ data: { applicationId, userId, status: "ACTIVE", role } });
				return "added";
			});
		} catch (error) {
			if (isUniqueViolation(error)) return "exists";
			throw error;
		}
	}

	async changeApplicationMemberRole(
		organizationId: string,
		applicationId: string,
		userId: string,
		role: TenantRole,
	): Promise<boolean> {
		const result = await this.deps.prisma.applicationMembership.updateMany({
			where: { applicationId, userId, status: "ACTIVE", application: { organizationId, archivedAt: null } },
			data: { role },
		});
		return result.count > 0;
	}

	async removeApplicationMember(organizationId: string, applicationId: string, userId: string): Promise<boolean> {
		const result = await this.deps.prisma.applicationMembership.deleteMany({
			where: { applicationId, userId, application: { organizationId, archivedAt: null } },
		});
		return result.count > 0;
	}
}
