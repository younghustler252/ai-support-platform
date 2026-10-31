import type { Request, Response } from "express";

import { authContext, requestMeta, validatedBody, validatedParams } from "../../auth/http/auth-http.js";
import { tenantContext } from "../../tenancy/http/tenant-http.js";
import type { AcceptInvitationUseCase } from "../usecases/accept-invitation.usecase.js";
import type { AddApplicationMemberUseCase } from "../usecases/add-application-member.usecase.js";
import type { ChangeApplicationMemberRoleUseCase } from "../usecases/change-application-member-role.usecase.js";
import type { ChangeOrganizationMemberRoleUseCase } from "../usecases/change-organization-member-role.usecase.js";
import type { CreateInvitationUseCase } from "../usecases/create-invitation.usecase.js";
import type { ListApplicationMembersUseCase } from "../usecases/list-application-members.usecase.js";
import type { ListInvitationsUseCase } from "../usecases/list-invitations.usecase.js";
import type { ListOrganizationMembersUseCase } from "../usecases/list-organization-members.usecase.js";
import type { RemoveApplicationMemberUseCase } from "../usecases/remove-application-member.usecase.js";
import type { RemoveOrganizationMemberUseCase } from "../usecases/remove-organization-member.usecase.js";
import type { RevokeInvitationUseCase } from "../usecases/revoke-invitation.usecase.js";
import type {
	AcceptInvitationInput,
	AddApplicationMemberInput,
	ApplicationMemberParams,
	ChangeApplicationMemberRoleInput,
	ChangeOrganizationMemberRoleInput,
	CreateInvitationInput,
	InvitationParams,
	OrganizationMemberParams,
} from "../validators/membership.validator.js";

interface Dependencies {
	listOrganizationMembersUseCase: ListOrganizationMembersUseCase;
	changeOrganizationMemberRoleUseCase: ChangeOrganizationMemberRoleUseCase;
	removeOrganizationMemberUseCase: RemoveOrganizationMemberUseCase;
	createInvitationUseCase: CreateInvitationUseCase;
	listInvitationsUseCase: ListInvitationsUseCase;
	revokeInvitationUseCase: RevokeInvitationUseCase;
	acceptInvitationUseCase: AcceptInvitationUseCase;
	listApplicationMembersUseCase: ListApplicationMembersUseCase;
	addApplicationMemberUseCase: AddApplicationMemberUseCase;
	changeApplicationMemberRoleUseCase: ChangeApplicationMemberRoleUseCase;
	removeApplicationMemberUseCase: RemoveApplicationMemberUseCase;
}

export class MembershipController {
	constructor(private readonly deps: Dependencies) {}

	listMembers = async (_request: Request, response: Response): Promise<void> => {
		const { organizationId } = tenantContext(response);
		response.json({ data: { members: await this.deps.listOrganizationMembersUseCase.execute(organizationId) } });
	};

	changeMemberRole = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, role: actorRole } = tenantContext(response);
		const { userId } = validatedParams<OrganizationMemberParams>(response);
		const { role } = validatedBody<ChangeOrganizationMemberRoleInput>(response);
		const member = await this.deps.changeOrganizationMemberRoleUseCase.execute(
			{ organizationId, actorId: user.id, actorRole, targetUserId: userId, role },
			requestMeta(request),
		);
		response.json({ data: { member } });
	};

	removeMember = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, role: actorRole } = tenantContext(response);
		const { userId } = validatedParams<OrganizationMemberParams>(response);
		response.json({
			data: await this.deps.removeOrganizationMemberUseCase.execute(
				{ organizationId, actorId: user.id, actorRole, targetUserId: userId },
				requestMeta(request),
			),
		});
	};

	createInvitation = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId } = tenantContext(response);
		const { email, role } = validatedBody<CreateInvitationInput>(response);
		const result = await this.deps.createInvitationUseCase.execute(
			{ organizationId, inviter: { id: user.id, name: user.displayName ?? user.email }, email, role },
			requestMeta(request),
		);
		response.status(201).json({ data: result });
	};

	listInvitations = async (_request: Request, response: Response): Promise<void> => {
		const { organizationId } = tenantContext(response);
		response.json({ data: { invitations: await this.deps.listInvitationsUseCase.execute(organizationId) } });
	};

	revokeInvitation = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId } = tenantContext(response);
		const { invitationId } = validatedParams<InvitationParams>(response);
		response.json({
			data: await this.deps.revokeInvitationUseCase.execute({ organizationId, invitationId, actorId: user.id }, requestMeta(request)),
		});
	};

	acceptInvitation = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { token } = validatedBody<AcceptInvitationInput>(response);
		response.json({
			data: await this.deps.acceptInvitationUseCase.execute({ token, user: { id: user.id, email: user.email } }, requestMeta(request)),
		});
	};

	listApplicationMembers = async (_request: Request, response: Response): Promise<void> => {
		const { organizationId, applicationId } = tenantContext(response);
		response.json({
			data: { members: await this.deps.listApplicationMembersUseCase.execute(organizationId, applicationId as string) },
		});
	};

	addApplicationMember = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, applicationId } = tenantContext(response);
		const { userId, role } = validatedBody<AddApplicationMemberInput>(response);
		const member = await this.deps.addApplicationMemberUseCase.execute(
			{ organizationId, applicationId: applicationId as string, actorId: user.id, userId, role },
			requestMeta(request),
		);
		response.status(201).json({ data: { member } });
	};

	changeApplicationMemberRole = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, applicationId } = tenantContext(response);
		const { userId } = validatedParams<ApplicationMemberParams>(response);
		const { role } = validatedBody<ChangeApplicationMemberRoleInput>(response);
		const member = await this.deps.changeApplicationMemberRoleUseCase.execute(
			{ organizationId, applicationId: applicationId as string, actorId: user.id, userId, role },
			requestMeta(request),
		);
		response.json({ data: { member } });
	};

	removeApplicationMember = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, applicationId } = tenantContext(response);
		const { userId } = validatedParams<ApplicationMemberParams>(response);
		response.json({
			data: await this.deps.removeApplicationMemberUseCase.execute(
				{ organizationId, applicationId: applicationId as string, actorId: user.id, userId },
				requestMeta(request),
			),
		});
	};
}
