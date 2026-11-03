import type { Request, Response } from "express";

import { tenantContext } from "../../tenancy/http/tenant-http.js";
import type { GetPlanUseCase } from "../usecases/get-plan.usecase.js";

export class PlanController {
	constructor(private readonly deps: { getPlanUseCase: GetPlanUseCase }) {}

	get = async (_request: Request, response: Response): Promise<void> => {
		const { organizationId } = tenantContext(response);
		response.json({ data: await this.deps.getPlanUseCase.execute(organizationId) });
	};
}
