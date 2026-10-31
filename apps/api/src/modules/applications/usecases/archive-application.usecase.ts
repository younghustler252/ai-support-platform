import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { IApplicationRepository } from "../repositories/application.repository.interface.js";

export class ArchiveApplicationUseCase {
	constructor(private readonly deps: { applicationRepository: IApplicationRepository; auditService: AuditRecorder }) {}

	async execute(
		input: { organizationId: string; applicationId: string; actorId: string },
		meta: RequestMeta = {},
	): Promise<{ archived: true }> {
		if (!(await this.deps.applicationRepository.archive(input.organizationId, input.applicationId))) {
			throw new NotFoundError("Application not found");
		}
		await this.deps.auditService.record({
			actorUserId: input.actorId,
			action: "application.archived",
			resourceType: "Application",
			resourceId: input.applicationId,
			metadata: auditMetadata(meta, { organizationId: input.organizationId, applicationId: input.applicationId }),
		});
		return { archived: true };
	}
}
