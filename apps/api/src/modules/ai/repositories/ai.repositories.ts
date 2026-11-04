import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { IApplicationConfigStore } from "../../application-settings/application-config.store.js";
import type { AiSettings } from "../ai.types.js";

export const defaultAiSettings: AiSettings = { enabled: true, instructions: "", fallbackMessage: null };

export interface IAiSettingsRepository {
	get(applicationId: string): Promise<AiSettings>;
	save(applicationId: string, patch: Partial<AiSettings>): Promise<AiSettings>;
}

export interface IAiUsageRepository {
	record(applicationId: string, metric: string, metadata: Record<string, string | number | boolean>): Promise<void>;
	countSince(applicationId: string, metric: string, since: Date): Promise<number>;
}

function readSettings(config: unknown): AiSettings {
	const ai = (config as { ai?: Partial<AiSettings> } | null)?.ai ?? {};
	return {
		enabled: typeof ai.enabled === "boolean" ? ai.enabled : defaultAiSettings.enabled,
		instructions: typeof ai.instructions === "string" ? ai.instructions : defaultAiSettings.instructions,
		fallbackMessage: typeof ai.fallbackMessage === "string" ? ai.fallbackMessage : null,
	};
}

export class AiSettingsRepositoryImpl implements IAiSettingsRepository {
	constructor(private readonly deps: { applicationConfigStore: IApplicationConfigStore }) {}

	async get(applicationId: string): Promise<AiSettings> {
		const config = await this.deps.applicationConfigStore.read(applicationId);
		return readSettings(config);
	}

	save(applicationId: string, patch: Partial<AiSettings>): Promise<AiSettings> {
		return this.deps.applicationConfigStore.update(applicationId, "ai", (current) => ({ ...readSettings({ ai: current }), ...patch }));
	}
}

export class AiUsageRepositoryImpl implements IAiUsageRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	async record(applicationId: string, metric: string, metadata: Record<string, string | number | boolean>): Promise<void> {
		await this.deps.prisma.usageEvent.create({ data: { applicationId, metric, metadata } });
	}

	countSince(applicationId: string, metric: string, since: Date): Promise<number> {
		return this.deps.prisma.usageEvent.count({ where: { applicationId, metric, createdAt: { gte: since } } });
	}
}
