import { scopeCovers } from "../../rbac/permission-catalog.js";
import type { EffectiveGrants } from "../../tenancy/tenancy.types.js";
import type { ApplicationView, IApplicationRepository } from "../repositories/application.repository.interface.js";

export class ListApplicationsUseCase {
	constructor(private readonly deps: { applicationRepository: IApplicationRepository }) {}

	execute(input: { organizationId: string; userId: string; grants: EffectiveGrants }): Promise<ApplicationView[]> {
		const seesAll = scopeCovers(input.grants["application.read"], "ORGANIZATION");
		return this.deps.applicationRepository.listVisible(input.organizationId, input.userId, seesAll);
	}
}
