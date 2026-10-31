import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { TenantRole } from "../../tenancy/tenancy.types.js";
import type { IOrganizationRepository, OrganizationWithRole } from "../repositories/organization.repository.interface.js";

export class UpdateOrganizationUseCase {
	constructor(private readonly deps: { organizationRepository: IOrganizationRepository; auditService: AuditRecorder }) {}

	async execute(
		input: { organizationId: string; actorId: string; role: TenantRole; name: string },
		meta: RequestMeta = {},
	): Promise<OrganizationWithRole> {
		const organization = await this.deps.organizationRepository.update(input.organizationId, { name: input.name });
		if (!organization) throw new NotFoundError("Organization not found");

		await this.deps.auditService.record({
			actorUserId: input.actorId,
			action: "organization.updated",
			resourceType: "Organization",
			resourceId: organization.id,
			metadata: auditMetadata(meta, { organizationId: organization.id }),
		});
		return { ...organization, role: input.role };
	}
}
