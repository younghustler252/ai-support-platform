import { ConflictError, ForbiddenError, NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { TenantRole } from "../../tenancy/tenancy.types.js";
import type { IMembershipRepository } from "../repositories/membership.repository.interface.js";

interface Input {
	organizationId: string;
	actorId: string;
	actorRole: TenantRole;
	targetUserId: string;
	role: TenantRole;
}

export class ChangeOrganizationMemberRoleUseCase {
	constructor(private readonly deps: { membershipRepository: IMembershipRepository; auditService: AuditRecorder }) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<{ userId: string; role: TenantRole }> {
		const { membershipRepository, auditService } = this.deps;

		const target = await membershipRepository.findOrganizationMember(input.organizationId, input.targetUserId);
		if (!target) throw new NotFoundError("Member not found");

		if (target.userId === input.actorId && input.actorRole !== "OWNER") {
			throw new ForbiddenError("You cannot change your own role");
		}
		if ((target.role === "OWNER" || input.role === "OWNER") && input.actorRole !== "OWNER") {
			throw new ForbiddenError("Only owners can change owner roles");
		}
		if (target.role === input.role) return { userId: target.userId, role: target.role };

		const result = await membershipRepository.changeOrganizationMemberRole(
			input.organizationId,
			input.targetUserId,
			input.role,
		);
		if (result === "not_found") throw new NotFoundError("Member not found");
		if (result === "last_owner") throw new ConflictError("An organization must keep at least one owner");

		await auditService.record({
			actorUserId: input.actorId,
			action: "organization.member.role_changed",
			resourceType: "OrganizationMembership",
			resourceId: input.targetUserId,
			metadata: auditMetadata(meta, {
				organizationId: input.organizationId,
				targetUserId: input.targetUserId,
				from: target.role,
				to: input.role,
			}),
		});
		return { userId: target.userId, role: input.role };
	}
}
