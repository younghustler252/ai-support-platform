import type { ApplicationMemberView, IMembershipRepository } from "../repositories/membership.repository.interface.js";

export class ListApplicationMembersUseCase {
	constructor(private readonly deps: { membershipRepository: IMembershipRepository }) {}

	execute(organizationId: string, applicationId: string): Promise<ApplicationMemberView[]> {
		return this.deps.membershipRepository.listApplicationMembers(organizationId, applicationId);
	}
}
