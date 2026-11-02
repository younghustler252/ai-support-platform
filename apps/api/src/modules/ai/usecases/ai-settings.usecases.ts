import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { AiSettings } from "../ai.types.js";
import type { IAiSettingsRepository } from "../repositories/ai.repositories.js";

export class GetAiSettingsUseCase {
	constructor(private readonly deps: { aiSettingsRepository: IAiSettingsRepository }) {}

	execute(applicationId: string): Promise<AiSettings> {
		return this.deps.aiSettingsRepository.get(applicationId);
	}
}

export class UpdateAiSettingsUseCase {
	constructor(private readonly deps: { aiSettingsRepository: IAiSettingsRepository; auditService: AuditRecorder }) {}

	async execute(
		input: { organizationId: string; applicationId: string; actorId: string; patch: Partial<AiSettings> },
		meta: RequestMeta = {},
	): Promise<AiSettings> {
		const settings = await this.deps.aiSettingsRepository.save(input.applicationId, input.patch);
		await this.deps.auditService.record({
			actorUserId: input.actorId,
			action: "ai.settings.updated",
			resourceType: "Application",
			resourceId: input.applicationId,
			metadata: auditMetadata(meta, {
				organizationId: input.organizationId,
				applicationId: input.applicationId,
				fields: Object.keys(input.patch).join(","),
			}),
		});
		return settings;
	}
}
