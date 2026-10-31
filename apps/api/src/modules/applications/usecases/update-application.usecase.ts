import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type {
	ApplicationPatch,
	ApplicationView,
	IApplicationRepository,
} from "../repositories/application.repository.interface.js";

interface Input {
	organizationId: string;
	applicationId: string;
	actorId: string;
	patch: ApplicationPatch;
}

export class UpdateApplicationUseCase {
	constructor(private readonly deps: { applicationRepository: IApplicationRepository; auditService: AuditRecorder }) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<ApplicationView> {
		const application = await this.deps.applicationRepository.update(input.organizationId, input.applicationId, input.patch);
		if (!application) throw new NotFoundError("Application not found");

		await this.deps.auditService.record({
			actorUserId: input.actorId,
			action: "application.updated",
			resourceType: "Application",
			resourceId: application.id,
			metadata: auditMetadata(meta, {
				organizationId: input.organizationId,
				applicationId: application.id,
				fields: Object.keys(input.patch).join(","),
			}),
		});
		return application;
	}
}
