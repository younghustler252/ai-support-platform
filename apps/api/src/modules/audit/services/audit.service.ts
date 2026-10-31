import { logger } from "../../../foundation/logging/logger.js";
import type { AuditEvent, IAuditRepository } from "../repositories/audit.repository.interface.js";

export interface AuditRecorder {
	record(event: AuditEvent): Promise<void>;
}

export class AuditService implements AuditRecorder {
	constructor(private readonly deps: { auditRepository: IAuditRepository }) {}

	async record(event: AuditEvent): Promise<void> {
		try {
			await this.deps.auditRepository.create(event);
		} catch (error) {
			logger.warn("audit.write_failed", { action: event.action, error });
		}
	}
}
