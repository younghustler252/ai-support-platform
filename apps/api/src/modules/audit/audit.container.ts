import { asClass, type AwilixContainer } from "awilix";

import { AuditRepositoryImpl } from "./repositories/audit.repository.impl.js";
import { AuditService } from "./services/audit.service.js";

export function registerAudit(container: AwilixContainer): void {
	container.register({
		auditRepository: asClass(AuditRepositoryImpl).singleton(),
		auditService: asClass(AuditService).singleton(),
	});
}
