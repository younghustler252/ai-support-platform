import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { IInvitationRepository } from "../repositories/invitation.repository.interface.js";

export class RevokeInvitationUseCase {
	constructor(private readonly deps: { invitationRepository: IInvitationRepository; auditService: AuditRecorder }) {}

	async execute(
		input: { organizationId: string; invitationId: string; actorId: string },
		meta: RequestMeta = {},
	): Promise<{ revoked: true }> {
		if (!(await this.deps.invitationRepository.revoke(input.organizationId, input.invitationId))) {
			throw new NotFoundError("Invitation not found");
		}
		await this.deps.auditService.record({
			actorUserId: input.actorId,
			action: "organization.invitation.revoked",
			resourceType: "Invitation",
			resourceId: input.invitationId,
			metadata: auditMetadata(meta, { organizationId: input.organizationId }),
		});
		return { revoked: true };
	}
}
