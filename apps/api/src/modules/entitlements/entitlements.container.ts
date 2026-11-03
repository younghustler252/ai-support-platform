import { asClass, type AwilixContainer } from "awilix";

import { PlanController } from "./controllers/plan.controller.js";
import { EntitlementRepositoryImpl } from "./repositories/entitlement.repository.impl.js";
import { EntitlementService } from "./services/entitlement.service.js";
import { GetPlanUseCase } from "./usecases/get-plan.usecase.js";

export function registerEntitlements(container: AwilixContainer): void {
	container.register({
		entitlementRepository: asClass(EntitlementRepositoryImpl).scoped(),
		entitlementService: asClass(EntitlementService).scoped(),
		getPlanUseCase: asClass(GetPlanUseCase).scoped(),
		planController: asClass(PlanController).scoped(),
	});
}
