import { asClass, type AwilixContainer } from "awilix";

import { InvitationEmailAdapter } from "../../infrastructure/email/invitation-email.adapter.js";
import { MembershipController } from "./controllers/membership.controller.js";
import { InvitationRepositoryImpl } from "./repositories/invitation.repository.impl.js";
import { MembershipRepositoryImpl } from "./repositories/membership.repository.impl.js";
import { AcceptInvitationUseCase } from "./usecases/accept-invitation.usecase.js";
import { AddApplicationMemberUseCase } from "./usecases/add-application-member.usecase.js";
import { ChangeApplicationMemberRoleUseCase } from "./usecases/change-application-member-role.usecase.js";
import { ChangeOrganizationMemberRoleUseCase } from "./usecases/change-organization-member-role.usecase.js";
import { CreateInvitationUseCase } from "./usecases/create-invitation.usecase.js";
import { ListApplicationMembersUseCase } from "./usecases/list-application-members.usecase.js";
import { ListInvitationsUseCase } from "./usecases/list-invitations.usecase.js";
import { ListOrganizationMembersUseCase } from "./usecases/list-organization-members.usecase.js";
import { RemoveApplicationMemberUseCase } from "./usecases/remove-application-member.usecase.js";
import { RemoveOrganizationMemberUseCase } from "./usecases/remove-organization-member.usecase.js";
import { RevokeInvitationUseCase } from "./usecases/revoke-invitation.usecase.js";

export function registerMemberships(container: AwilixContainer): void {
	container.register({
		membershipRepository: asClass(MembershipRepositoryImpl).scoped(),
		invitationRepository: asClass(InvitationRepositoryImpl).scoped(),
		invitationEmailService: asClass(InvitationEmailAdapter).singleton(),
		listOrganizationMembersUseCase: asClass(ListOrganizationMembersUseCase).scoped(),
		changeOrganizationMemberRoleUseCase: asClass(ChangeOrganizationMemberRoleUseCase).scoped(),
		removeOrganizationMemberUseCase: asClass(RemoveOrganizationMemberUseCase).scoped(),
		createInvitationUseCase: asClass(CreateInvitationUseCase).scoped(),
		listInvitationsUseCase: asClass(ListInvitationsUseCase).scoped(),
		revokeInvitationUseCase: asClass(RevokeInvitationUseCase).scoped(),
		acceptInvitationUseCase: asClass(AcceptInvitationUseCase).scoped(),
		listApplicationMembersUseCase: asClass(ListApplicationMembersUseCase).scoped(),
		addApplicationMemberUseCase: asClass(AddApplicationMemberUseCase).scoped(),
		changeApplicationMemberRoleUseCase: asClass(ChangeApplicationMemberRoleUseCase).scoped(),
		removeApplicationMemberUseCase: asClass(RemoveApplicationMemberUseCase).scoped(),
		membershipController: asClass(MembershipController).scoped(),
	});
}
