import type { Request, Response } from "express";

import { validatedQuery } from "../../../foundation/http/locals.js";
import { tenantContext } from "../../tenancy/http/tenant-http.js";
import type { ListAuditLogsQuery } from "../validators/audit.validator.js";
import type { ListAuditLogsUseCase } from "../usecases/list-audit-logs.usecase.js";

export class AuditController {
	constructor(private readonly deps: { listAuditLogsUseCase: ListAuditLogsUseCase }) {}

	list = async (_request: Request, response: Response): Promise<void> => {
		const { organizationId } = tenantContext(response);
		const query = validatedQuery<ListAuditLogsQuery>(response);
		const page = await this.deps.listAuditLogsUseCase.execute({ ...query, organizationId });
		response.json({ data: { logs: page.items }, meta: { nextCursor: page.nextCursor } });
	};
}
