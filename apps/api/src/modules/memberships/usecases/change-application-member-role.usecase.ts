import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { TenantRole } from "../../tenancy/tenancy.types.js";
import type { IMembershipRepository } from "../repositories/membership.repository.interface.js";

interface Input {
	organizationId: string;
	applicationId: string;
	actorId: string;
	userId: string;
	role: TenantRole;
}

export class ChangeApplicationMemberRoleUseCase {
	constructor(private readonly deps: { membershipRepository: IMembershipRepository; auditService: AuditRecorder }) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<{ userId: string; role: TenantRole }> {
		const updated = await this.deps.membershipRepository.changeApplicationMemberRole(
			input.organizationId,
			input.applicationId,
			input.userId,
			input.role,
		);
		if (!updated) throw new NotFoundError("Member not found");

		await this.deps.auditService.record({
			actorUserId: input.actorId,
			action: "application.member.role_changed",
			resourceType: "ApplicationMembership",
			resourceId: input.userId,
			metadata: auditMetadata(meta, {
				organizationId: input.organizationId,
				applicationId: input.applicationId,
				targetUserId: input.userId,
				to: input.role,
			}),
		});
		return { userId: input.userId, role: input.role };
	}
}
