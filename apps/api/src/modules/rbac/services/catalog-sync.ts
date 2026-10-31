import type { PrismaClient } from "../../../generated/prisma/client.js";
import { permissionCatalog, systemRoles } from "../permission-catalog.js";

const ADVISORY_LOCK_KEY = 727_001;

export async function syncRbacCatalog(prisma: PrismaClient): Promise<void> {
	await prisma.$transaction(
		async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`;

			for (const definition of permissionCatalog) {
				await tx.permission.upsert({
					where: { code: definition.code },
					create: {
						code: definition.code,
						realm: definition.realm,
						description: definition.description,
						delegable: definition.delegable,
					},
					update: { realm: definition.realm, description: definition.description, delegable: definition.delegable },
				});
			}
			await tx.permission.deleteMany({ where: { code: { notIn: permissionCatalog.map((definition) => definition.code) } } });

			const permissions = await tx.permission.findMany({ select: { id: true, code: true } });
			const idByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

			for (const definition of systemRoles) {
				const role = await tx.role.upsert({
					where: { key: definition.key },
					create: {
						key: definition.key,
						name: definition.name,
						nameKey: definition.key,
						scopeKey: "system",
						description: definition.description,
						realm: definition.realm,
						isProtected: true,
					},
					update: { name: definition.name, description: definition.description, realm: definition.realm, isProtected: true },
				});
				await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
				await tx.rolePermission.createMany({
					data: definition.permissions.map((grant) => ({
						roleId: role.id,
						scope: grant.scope,
						permissionId: idByCode.get(grant.code) as string,
					})),
				});
			}
		},
		{ timeout: 30_000 },
	);
}
