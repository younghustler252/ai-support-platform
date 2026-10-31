import type { IInvitationRepository, InvitationView } from "../repositories/invitation.repository.interface.js";

export class ListInvitationsUseCase {
	constructor(private readonly deps: { invitationRepository: IInvitationRepository }) {}

	execute(organizationId: string): Promise<InvitationView[]> {
		return this.deps.invitationRepository.listPending(organizationId);
	}
}
