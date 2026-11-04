import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import type { IAiSettingsRepository } from "../../ai/repositories/ai.repositories.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { ISettingsRepository } from "../repositories/settings.repository.js";
import type { ApplicationSettings, ApplicationSettingsPatch, PublicWidgetConfig } from "../settings.types.js";

export class GetApplicationSettingsUseCase {
	constructor(private readonly deps: { settingsRepository: ISettingsRepository }) {}

	execute(applicationId: string): Promise<ApplicationSettings> {
		return this.deps.settingsRepository.get(applicationId);
	}
}

export class UpdateApplicationSettingsUseCase {
	constructor(private readonly deps: { settingsRepository: ISettingsRepository; auditService: AuditRecorder }) {}

	async execute(
		input: { organizationId: string; applicationId: string; actorId: string; patch: ApplicationSettingsPatch },
		meta: RequestMeta = {},
	): Promise<ApplicationSettings> {
		const settings = await this.deps.settingsRepository.save(input.applicationId, input.patch);
		const changed = [
			...(input.patch.timezone !== undefined ? ["timezone"] : []),
			...Object.keys(input.patch.widget ?? {}).map((key) => `widget.${key}`),
		];
		await this.deps.auditService.record({
			actorUserId: input.actorId,
			action: "application.settings.updated",
			resourceType: "Application",
			resourceId: input.applicationId,
			metadata: auditMetadata(meta, {
				organizationId: input.organizationId,
				applicationId: input.applicationId,
				changed: changed.join(","),
			}),
		});
		return settings;
	}
}

export class GetWidgetConfigUseCase {
	constructor(private readonly deps: { settingsRepository: ISettingsRepository; aiSettingsRepository: IAiSettingsRepository }) {}

	async execute(application: { id: string; name: string }): Promise<PublicWidgetConfig> {
		const [settings, ai] = await Promise.all([
			this.deps.settingsRepository.get(application.id),
			this.deps.aiSettingsRepository.get(application.id),
		]);
		return {
			title: settings.widget.title ?? application.name,
			welcomeMessage: settings.widget.welcomeMessage,
			primaryColor: settings.widget.primaryColor,
			position: settings.widget.position,
			aiEnabled: ai.enabled,
		};
	}
}
