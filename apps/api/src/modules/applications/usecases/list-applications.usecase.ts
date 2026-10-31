import { atLeast } from "../../tenancy/policies.js";
import type { TenantRole } from "../../tenancy/tenancy.types.js";
import type { ApplicationView, IApplicationRepository } from "../repositories/application.repository.interface.js";

export class ListApplicationsUseCase {
	constructor(private readonly deps: { applicationRepository: IApplicationRepository }) {}

	execute(input: { organizationId: string; userId: string; role: TenantRole }): Promise<ApplicationView[]> {
		return this.deps.applicationRepository.listVisible(input.organizationId, input.userId, atLeast(input.role, "ADMIN"));
	}
}
