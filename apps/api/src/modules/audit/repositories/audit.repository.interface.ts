import type { Page } from "../../../foundation/utils/cursor.js";
import type { AuditLogQuery, AuditLogView } from "../audit.types.js";

export type AuditMetadata = Record<string, string | number | boolean | null>;

export interface AuditEvent {
	actorUserId?: string | null;
	action: string;
	resourceType: string;
	resourceId?: string | null;
	metadata?: AuditMetadata;
}

export interface IAuditRepository {
	create(event: AuditEvent): Promise<void>;
	list(query: AuditLogQuery): Promise<Page<AuditLogView>>;
}
