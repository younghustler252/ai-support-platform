import { ValidationError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import type { TokenService } from "../../auth/services/token.service.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { TenantRole } from "../../tenancy/tenancy.types.js";
import type { IInvitationRepository } from "../repositories/invitation.repository.interface.js";

interface Input {
	token: string;
	user: { id: string; email: string };
}

export class AcceptInvitationUseCase {
	constructor(private readonly deps: {
		invitationRepository: IInvitationRepository;
		tokenService: TokenService;
		auditService: AuditRecorder;
	}) {}

	async execute(
		input: Input,
		meta: RequestMeta = {},
	): Promise<{ organization: { id: string; name: string }; role: TenantRole }> {
		const { invitationRepository, tokenService } = this.deps;
		const invalid = () => new ValidationError("Invalid or expired invitation");

		const invitation = await invitationRepository.findByTokenHash(tokenService.hash(input.token));
		if (
			!invitation ||
			invitation.acceptedAt ||
			invitation.revokedAt ||
			invitation.expiresAt <= new Date() ||
			invitation.organizationArchivedAt ||
			invitation.email !== input.user.email.toLowerCase()
		) {
			throw invalid();
		}

		const accepted = await invitationRepository.accept({
			invitationId: invitation.id,
			organizationId: invitation.organizationId,
			userId: input.user.id,
			role: invitation.role,
		});
		if (!accepted) throw invalid();

		await this.deps.auditService.record({
			actorUserId: input.user.id,
			action: "organization.invitation.accepted",
			resourceType: "Invitation",
			resourceId: invitation.id,
			metadata: auditMetadata(meta, { organizationId: invitation.organizationId, role: invitation.role }),
		});
		return {
			organization: { id: invitation.organizationId, name: invitation.organizationName },
			role: invitation.role,
		};
	}
}
