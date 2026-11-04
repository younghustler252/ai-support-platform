import { Router } from "express";

import { delegate } from "../../../foundation/http/locals.js";
import { validateQuery } from "../../../foundation/validation/validate.js";
import { requireAuth } from "../../auth/middleware/require-auth.js";
import { requireOrganization } from "../../tenancy/middleware/tenant-access.js";
import type { AuditController } from "../controllers/audit.controller.js";
import { listAuditLogsQuerySchema } from "../validators/audit.validator.js";

export function auditRouter(): Router {
	const router = Router();
	router.get(
		"/organizations/:organizationId/audit-logs",
		requireAuth,
		requireOrganization("audit.read"),
		validateQuery(listAuditLogsQuerySchema),
		delegate<AuditController>("auditController", "list"),
	);
	return router;
}
