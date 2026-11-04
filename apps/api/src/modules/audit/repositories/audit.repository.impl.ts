import type { Prisma, PrismaClient } from "../../../generated/prisma/client.js";
import { decodeCursor, toPage, type Page } from "../../../foundation/utils/cursor.js";
import type { AuditLogQuery, AuditLogView } from "../audit.types.js";
import type { AuditEvent, IAuditRepository } from "./audit.repository.interface.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tenantId(metadata: AuditEvent["metadata"], key: "organizationId" | "applicationId"): string | null {
	const value = metadata?.[key];
	return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

export class AuditRepositoryImpl implements IAuditRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	async create(event: AuditEvent): Promise<void> {
		await this.deps.prisma.auditLog.create({
			data: {
				actorUserId: event.actorUserId ?? null,
				organizationId: tenantId(event.metadata, "organizationId"),
				applicationId: tenantId(event.metadata, "applicationId"),
				action: event.action,
				resourceType: event.resourceType,
				resourceId: event.resourceId ?? null,
				metadata: event.metadata,
			},
		});
	}

	async list(query: AuditLogQuery): Promise<Page<AuditLogView>> {
		const cursor = decodeCursor(query.cursor);
		const and: Prisma.AuditLogWhereInput[] = [];
		if (cursor) and.push({ OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] });

		const rows = await this.deps.prisma.auditLog.findMany({
			where: {
				organizationId: query.organizationId,
				applicationId: query.applicationId,
				actorUserId: query.actorUserId,
				action: query.action ? { startsWith: query.action } : undefined,
				createdAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
				AND: and,
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: query.limit + 1,
			include: { actor: { select: { id: true, email: true, displayName: true } } },
		});

		return toPage(
			rows.map((row) => ({
				id: row.id,
				action: row.action,
				resourceType: row.resourceType,
				resourceId: row.resourceId,
				applicationId: row.applicationId,
				actor: row.actor,
				metadata: row.metadata,
				createdAt: row.createdAt,
			})),
			query.limit,
			(row) => ({ at: row.createdAt, id: row.id }),
		);
	}
}
