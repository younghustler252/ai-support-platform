import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { AuditEvent, IAuditRepository } from "./audit.repository.interface.js";

export class AuditRepositoryImpl implements IAuditRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	async create(event: AuditEvent): Promise<void> {
		await this.deps.prisma.auditLog.create({
			data: {
				actorUserId: event.actorUserId ?? null,
				action: event.action,
				resourceType: event.resourceType,
				resourceId: event.resourceId ?? null,
				metadata: event.metadata,
			},
		});
	}
}
