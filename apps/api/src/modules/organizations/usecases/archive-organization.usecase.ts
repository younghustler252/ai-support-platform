import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { IOrganizationRepository } from "../repositories/organization.repository.interface.js";

export class ArchiveOrganizationUseCase {
	constructor(private readonly deps: { organizationRepository: IOrganizationRepository; auditService: AuditRecorder }) {}

	async execute(input: { organizationId: string; actorId: string }, meta: RequestMeta = {}): Promise<{ archived: true }> {
		if (!(await this.deps.organizationRepository.archive(input.organizationId))) {
			throw new NotFoundError("Organization not found");
		}
		await this.deps.auditService.record({
			actorUserId: input.actorId,
			action: "organization.archived",
			resourceType: "Organization",
			resourceId: input.organizationId,
			metadata: auditMetadata(meta, { organizationId: input.organizationId }),
		});
		return { archived: true };
	}
}
