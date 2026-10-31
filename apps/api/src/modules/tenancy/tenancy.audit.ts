import type { AuditMetadata } from "../audit/repositories/audit.repository.interface.js";
import { auditContext, type RequestMeta } from "../auth/auth.types.js";

export function auditMetadata(meta: RequestMeta, extra: AuditMetadata = {}): AuditMetadata {
	return { ...auditContext(meta), ...extra };
}
