import type { Page } from "../../../foundation/utils/cursor.js";
import type { AuditLogQuery, AuditLogView } from "../audit.types.js";
import type { IAuditRepository } from "../repositories/audit.repository.interface.js";

export class ListAuditLogsUseCase {
	constructor(private readonly deps: { auditRepository: IAuditRepository }) {}

	execute(query: AuditLogQuery): Promise<Page<AuditLogView>> {
		return this.deps.auditRepository.list(query);
	}
}
