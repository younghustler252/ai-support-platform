import type { IMembershipRepository, OrganizationMemberView } from "../repositories/membership.repository.interface.js";

export class ListOrganizationMembersUseCase {
	constructor(private readonly deps: { membershipRepository: IMembershipRepository }) {}

	execute(organizationId: string): Promise<OrganizationMemberView[]> {
		return this.deps.membershipRepository.listOrganizationMembers(organizationId);
	}
}
