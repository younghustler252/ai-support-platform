import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { IMembershipRepository } from "../repositories/membership.repository.interface.js";

interface Input {
	organizationId: string;
	applicationId: string;
	actorId: string;
	userId: string;
}

export class RemoveApplicationMemberUseCase {
	constructor(private readonly deps: { membershipRepository: IMembershipRepository; auditService: AuditRecorder }) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<{ removed: true }> {
		const removed = await this.deps.membershipRepository.removeApplicationMember(
			input.organizationId,
			input.applicationId,
			input.userId,
		);
		if (!removed) throw new NotFoundError("Member not found");

		await this.deps.auditService.record({
			actorUserId: input.actorId,
			action: "application.member.removed",
			resourceType: "ApplicationMembership",
			resourceId: input.userId,
			metadata: auditMetadata(meta, {
				organizationId: input.organizationId,
				applicationId: input.applicationId,
				targetUserId: input.userId,
			}),
		});
		return { removed: true };
	}
}
