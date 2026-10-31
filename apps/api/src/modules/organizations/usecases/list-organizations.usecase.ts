import type { IOrganizationRepository, OrganizationWithRole } from "../repositories/organization.repository.interface.js";

export class ListOrganizationsUseCase {
	constructor(private readonly deps: { organizationRepository: IOrganizationRepository }) {}

	execute(userId: string): Promise<OrganizationWithRole[]> {
		return this.deps.organizationRepository.listForUser(userId);
	}
}
