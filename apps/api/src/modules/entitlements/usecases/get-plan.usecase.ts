import type { PlanOverview } from "../entitlement.types.js";
import type { IEntitlementService } from "../services/entitlement.service.js";

export class GetPlanUseCase {
	constructor(private readonly deps: { entitlementService: IEntitlementService }) {}

	execute(organizationId: string): Promise<PlanOverview> {
		return this.deps.entitlementService.overview(organizationId);
	}
}
