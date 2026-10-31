import { tenancyConfig } from "../../../config/tenancy.js";
import { ConflictError, LimitExceededError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { logEmailFailure } from "../../auth/auth.utils.js";
import type { TokenService } from "../../auth/services/token.service.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { TenantRole } from "../../tenancy/tenancy.types.js";
import type { IInvitationRepository, InvitationView } from "../repositories/invitation.repository.interface.js";
import type { InvitationEmailPort } from "../services/invitation-email.port.js";

interface Input {
	organizationId: string;
	inviter: { id: string; name: string };
	email: string;
	role: TenantRole;
}

export class CreateInvitationUseCase {
	constructor(private readonly deps: {
		invitationRepository: IInvitationRepository;
		invitationEmailService: InvitationEmailPort;
		tokenService: TokenService;
		auditService: AuditRecorder;
	}) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<{ invitation: InvitationView }> {
		const { invitationRepository, tokenService, auditService } = this.deps;

		if (await invitationRepository.isActiveMemberEmail(input.organizationId, input.email)) {
			throw new ConflictError("This person is already a member of the organization");
		}
		if ((await invitationRepository.countPending(input.organizationId)) >= tenancyConfig.limits.pendingInvitationsPerOrganization) {
			throw new LimitExceededError("Too many pending invitations; revoke some before sending more");
		}

		const token = tokenService.generate();
		const { invitation, organizationName } = await invitationRepository.create({
			organizationId: input.organizationId,
			email: input.email,
			role: input.role,
			tokenHash: tokenService.hash(token),
			invitedByUserId: input.inviter.id,
			expiresAt: new Date(Date.now() + tenancyConfig.invitationTtlMs),
		});

		await auditService.record({
			actorUserId: input.inviter.id,
			action: "organization.invitation.created",
			resourceType: "Invitation",
			resourceId: invitation.id,
			metadata: auditMetadata(meta, { organizationId: input.organizationId, role: input.role }),
		});
		await this.deps.invitationEmailService
			.sendInvitation(input.email, {
				organizationName,
				inviterName: input.inviter.name.replace(/[\r\n]+/g, " ").slice(0, 100),
				token,
			})
			.catch(logEmailFailure("invitation"));

		return { invitation };
	}
}
