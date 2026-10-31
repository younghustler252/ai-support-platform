import { ConflictError, NotFoundError, ValidationError } from "../../../foundation/errors/app-error.js";
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

export class AddApplicationMemberUseCase {
	constructor(private readonly deps: { membershipRepository: IMembershipRepository; auditService: AuditRecorder }) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<{ userId: string; role: TenantRole }> {
		const result = await this.deps.membershipRepository.addApplicationMember(
			input.organizationId,
			input.applicationId,
			input.userId,
			input.role,
		);
		if (result === "not_found") throw new NotFoundError("Application not found");
		if (result === "not_org_member") {
			throw new ValidationError("Only members of the organization can be added to an application", {
				issues: [{ path: "userId", code: "invalid", message: "User is not a member of this organization" }],
			});
		}
		if (result === "exists") throw new ConflictError("This user already has access to the application");

		await this.deps.auditService.record({
			actorUserId: input.actorId,
			action: "application.member.added",
			resourceType: "ApplicationMembership",
			resourceId: input.userId,
			metadata: auditMetadata(meta, {
				organizationId: input.organizationId,
				applicationId: input.applicationId,
				targetUserId: input.userId,
				role: input.role,
			}),
		});
		return { userId: input.userId, role: input.role };
	}
}
