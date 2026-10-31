import { tenancyConfig } from "../../../config/tenancy.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { RoleGrant } from "../../tenancy/tenancy.types.js";
import { scopeKeyOf, type AssignResult, type RoleAssignment, type RoleTarget, type RoleView } from "../rbac.types.js";
import type { IRoleRepository } from "./role.repository.interface.js";

const roleSelect = {
	id: true,
	key: true,
	name: true,
	description: true,
	realm: true,
	isProtected: true,
	createdAt: true,
	updatedAt: true,
	permissions: { select: { scope: true, permission: { select: { code: true } } } },
	_count: { select: { memberships: true, applicationMemberships: true } },
} as const;

interface RoleRow {
	id: string;
	key: string | null;
	name: string;
	description: string | null;
	realm: string;
	isProtected: boolean;
	createdAt: Date;
	updatedAt: Date;
	permissions: Array<{ scope: RoleGrant["scope"]; permission: { code: string } }>;
	_count: { memberships: number; applicationMemberships: number };
}

function toView(row: RoleRow): RoleView {
	return {
		id: row.id,
		key: row.key,
		name: row.name,
		description: row.description,
		realm: row.realm as RoleView["realm"],
		system: row.isProtected,
		permissions: row.permissions
			.map((item) => ({ code: item.permission.code, scope: item.scope }))
			.sort((first, second) => first.code.localeCompare(second.code)),
		assignedCount: row._count.memberships + row._count.applicationMemberships,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function customWhere(target: RoleTarget) {
	return {
		isProtected: false,
		realm: target.realm,
		scopeKey: scopeKeyOf(target),
		organizationId: target.organizationId,
		applicationId: target.realm === "APPLICATION" ? target.applicationId : null,
	};
}

function visibleWhere(target: RoleTarget) {
	return {
		OR: [{ isProtected: true, organizationId: null, realm: target.realm }, customWhere(target)],
	};
}

export class RoleRepositoryImpl implements IRoleRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	async list(target: RoleTarget): Promise<RoleView[]> {
		const rows = await this.deps.prisma.role.findMany({
			where: visibleWhere(target),
			select: roleSelect,
			orderBy: [{ isProtected: "desc" }, { name: "asc" }],
		});
		return rows.map(toView);
	}

	async find(target: RoleTarget, roleId: string): Promise<RoleView | null> {
		const row = await this.deps.prisma.role.findFirst({
			where: { id: roleId, ...visibleWhere(target) },
			select: roleSelect,
		});
		return row ? toView(row) : null;
	}

	countCustom(target: RoleTarget): Promise<number> {
		return this.deps.prisma.role.count({ where: customWhere(target) });
	}

	async create(
		target: RoleTarget,
		input: { name: string; description: string | null; permissions: RoleGrant[]; actorId: string },
	): Promise<RoleView> {
		return this.deps.prisma.$transaction(async (tx) => {
			const permissionIds = await this.permissionIds(tx, input.permissions);
			const row = await tx.role.create({
				data: {
					name: input.name,
					nameKey: input.name.toLowerCase(),
					scopeKey: scopeKeyOf(target),
					description: input.description,
					realm: target.realm,
					organizationId: target.organizationId,
					applicationId: target.realm === "APPLICATION" ? target.applicationId : null,
					createdByUserId: input.actorId,
					permissions: {
						create: input.permissions.map((grant) => ({
							scope: grant.scope,
							permissionId: permissionIds.get(grant.code) as string,
						})),
					},
				},
				select: roleSelect,
			});
			return toView(row);
		});
	}

	async update(
		target: RoleTarget,
		roleId: string,
		patch: { name?: string; description?: string | null; permissions?: RoleGrant[] },
	): Promise<RoleView | null> {
		return this.deps.prisma.$transaction(async (tx) => {
			const existing = await tx.role.findFirst({ where: { id: roleId, ...customWhere(target) }, select: { id: true } });
			if (!existing) return null;

			if (patch.permissions) {
				const permissionIds = await this.permissionIds(tx, patch.permissions);
				await tx.rolePermission.deleteMany({ where: { roleId } });
				await tx.rolePermission.createMany({
					data: patch.permissions.map((grant) => ({
						roleId,
						scope: grant.scope,
						permissionId: permissionIds.get(grant.code) as string,
					})),
				});
			}

			const row = await tx.role.update({
				where: { id: roleId },
				data: {
					...(patch.name !== undefined ? { name: patch.name, nameKey: patch.name.toLowerCase() } : {}),
					...(patch.description !== undefined ? { description: patch.description } : {}),
				},
				select: roleSelect,
			});
			return toView(row);
		});
	}

	async remove(target: RoleTarget, roleId: string): Promise<boolean> {
		return this.deps.prisma.$transaction(async (tx) => {
			const existing = await tx.role.findFirst({ where: { id: roleId, ...customWhere(target) }, select: { id: true } });
			if (!existing) return false;
			await tx.membershipRole.deleteMany({ where: { roleId } });
			await tx.applicationMembershipRole.deleteMany({ where: { roleId } });
			await tx.role.delete({ where: { id: roleId } });
			return true;
		});
	}

	async listAssignments(target: RoleTarget, roleId: string): Promise<RoleAssignment[]> {
		const user = { select: { id: true, email: true, displayName: true } } as const;

		if (target.realm === "ORGANIZATION") {
			const rows = await this.deps.prisma.membershipRole.findMany({
				where: { roleId, role: customWhere(target), membership: { status: "ACTIVE" } },
				select: { createdAt: true, membership: { select: { user } } },
				orderBy: { createdAt: "asc" },
			});
			return rows.map((row) => ({
				userId: row.membership.user.id,
				email: row.membership.user.email,
				displayName: row.membership.user.displayName,
				assignedAt: row.createdAt,
			}));
		}

		const rows = await this.deps.prisma.applicationMembershipRole.findMany({
			where: { roleId, role: customWhere(target), membership: { status: "ACTIVE" } },
			select: { createdAt: true, membership: { select: { user } } },
			orderBy: { createdAt: "asc" },
		});
		return rows.map((row) => ({
			userId: row.membership.user.id,
			email: row.membership.user.email,
			displayName: row.membership.user.displayName,
			assignedAt: row.createdAt,
		}));
	}

	async assign(target: RoleTarget, input: { roleId: string; userId: string; actorId: string }): Promise<AssignResult> {
		return this.deps.prisma.$transaction(async (tx): Promise<AssignResult> => {
			const role = await tx.role.findFirst({ where: { id: input.roleId, ...customWhere(target) }, select: { id: true } });
			if (!role) return "role-missing";

			if (target.realm === "ORGANIZATION") {
				const membership = await tx.organizationMembership.findFirst({
					where: { organizationId: target.organizationId, userId: input.userId, status: "ACTIVE" },
					select: { id: true },
				});
				if (!membership) return "not-member";

				const current = await tx.membershipRole.findMany({ where: { membershipId: membership.id }, select: { roleId: true } });
				if (current.some((item) => item.roleId === input.roleId)) return "already";
				if (current.length >= tenancyConfig.limits.rolesPerMembership) return "limit";

				await tx.membershipRole.create({
					data: { membershipId: membership.id, roleId: input.roleId, assignedByUserId: input.actorId },
				});
				return "assigned";
			}

			const membership = await tx.applicationMembership.findFirst({
				where: {
					applicationId: target.applicationId,
					userId: input.userId,
					status: "ACTIVE",
					application: { organizationId: target.organizationId, archivedAt: null },
				},
				select: { id: true },
			});
			if (!membership) return "not-member";

			const current = await tx.applicationMembershipRole.findMany({ where: { membershipId: membership.id }, select: { roleId: true } });
			if (current.some((item) => item.roleId === input.roleId)) return "already";
			if (current.length >= tenancyConfig.limits.rolesPerMembership) return "limit";

			await tx.applicationMembershipRole.create({
				data: { membershipId: membership.id, roleId: input.roleId, assignedByUserId: input.actorId },
			});
			return "assigned";
		});
	}

	async unassign(target: RoleTarget, roleId: string, userId: string): Promise<boolean> {
		if (target.realm === "ORGANIZATION") {
			const result = await this.deps.prisma.membershipRole.deleteMany({
				where: { roleId, role: customWhere(target), membership: { organizationId: target.organizationId, userId } },
			});
			return result.count > 0;
		}
		const result = await this.deps.prisma.applicationMembershipRole.deleteMany({
			where: {
				roleId,
				role: customWhere(target),
				membership: { applicationId: target.applicationId, userId, application: { organizationId: target.organizationId } },
			},
		});
		return result.count > 0;
	}

	private async permissionIds(
		tx: Pick<PrismaClient, "permission">,
		grants: readonly RoleGrant[],
	): Promise<Map<string, string>> {
		const rows = await tx.permission.findMany({
			where: { code: { in: grants.map((grant) => grant.code) } },
			select: { id: true, code: true },
		});
		const result = new Map<string, string>(rows.map((row: { id: string; code: string }): [string, string] => [row.code, row.id]));
		for (const grant of grants) {
			if (!result.has(grant.code)) throw new Error(`Permission ${grant.code} is not synchronised; run the RBAC catalog sync`);
		}
		return result;
	}
}
