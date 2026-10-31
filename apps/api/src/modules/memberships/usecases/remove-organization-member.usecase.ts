import { ConflictError, ForbiddenError, NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { atLeast } from "../../tenancy/policies.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { TenantRole } from "../../tenancy/tenancy.types.js";
import type { IMembershipRepository } from "../repositories/membership.repository.interface.js";

interface Input {
	organizationId: string;
	actorId: string;
	actorRole: TenantRole;
	targetUserId: string;
}

export class RemoveOrganizationMemberUseCase {
	constructor(private readonly deps: { membershipRepository: IMembershipRepository; auditService: AuditRecorder }) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<{ removed: true }> {
		const { membershipRepository, auditService } = this.deps;

		const target = await membershipRepository.findOrganizationMember(input.organizationId, input.targetUserId);
		if (!target) throw new NotFoundError("Member not found");

		const leaving = target.userId === input.actorId;
		if (!leaving) {
			if (!atLeast(input.actorRole, "ADMIN")) throw new ForbiddenError();
			if (target.role === "OWNER" && input.actorRole !== "OWNER") throw new ForbiddenError("Only owners can remove owners");
		}

		const result = await membershipRepository.removeOrganizationMember(input.organizationId, input.targetUserId);
		if (result === "not_found") throw new NotFoundError("Member not found");
		if (result === "last_owner") throw new ConflictError("An organization must keep at least one owner");

		await auditService.record({
			actorUserId: input.actorId,
			action: leaving ? "organization.member.left" : "organization.member.removed",
			resourceType: "OrganizationMembership",
			resourceId: input.targetUserId,
			metadata: auditMetadata(meta, { organizationId: input.organizationId, targetUserId: input.targetUserId }),
		});
		return { removed: true };
	}
}
