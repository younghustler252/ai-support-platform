import { asClass, type AwilixContainer } from "awilix";

import { AuditController } from "./controllers/audit.controller.js";
import { AuditRepositoryImpl } from "./repositories/audit.repository.impl.js";
import { AuditService } from "./services/audit.service.js";
import { ListAuditLogsUseCase } from "./usecases/list-audit-logs.usecase.js";

export function registerAudit(container: AwilixContainer): void {
	container.register({
		auditRepository: asClass(AuditRepositoryImpl).singleton(),
		auditService: asClass(AuditService).singleton(),
		listAuditLogsUseCase: asClass(ListAuditLogsUseCase).scoped(),
		auditController: asClass(AuditController).scoped(),
	});
}
