import { tenancyConfig } from "../../../config/tenancy.js";
import type { IApplicationConfigStore } from "../application-config.store.js";
import type { ApplicationSettings, ApplicationSettingsPatch, WidgetSettings } from "../settings.types.js";

export const defaultWidgetSettings: WidgetSettings = {
	title: null,
	welcomeMessage: null,
	primaryColor: "#111827",
	position: "right",
};

export interface ISettingsRepository {
	get(applicationId: string): Promise<ApplicationSettings>;
	save(applicationId: string, patch: ApplicationSettingsPatch): Promise<ApplicationSettings>;
}

function readWidget(value: unknown): WidgetSettings {
	const raw = (value ?? {}) as Partial<Record<keyof WidgetSettings, unknown>>;
	return {
		title: typeof raw.title === "string" ? raw.title : defaultWidgetSettings.title,
		welcomeMessage: typeof raw.welcomeMessage === "string" ? raw.welcomeMessage : defaultWidgetSettings.welcomeMessage,
		primaryColor: typeof raw.primaryColor === "string" ? raw.primaryColor : defaultWidgetSettings.primaryColor,
		position: raw.position === "left" ? "left" : "right",
	};
}

function readTimezone(value: unknown): string {
	return typeof value === "string" && value.length > 0 ? value : tenancyConfig.settings.defaultTimezone;
}

export class SettingsRepositoryImpl implements ISettingsRepository {
	constructor(private readonly deps: { applicationConfigStore: IApplicationConfigStore }) {}

	async get(applicationId: string): Promise<ApplicationSettings> {
		const config = await this.deps.applicationConfigStore.read(applicationId);
		return { timezone: readTimezone(config.general), widget: readWidget(config.widget) };
	}

	async save(applicationId: string, patch: ApplicationSettingsPatch): Promise<ApplicationSettings> {
		const { applicationConfigStore } = this.deps;
		if (patch.widget) {
			const changes = patch.widget;
			await applicationConfigStore.update(applicationId, "widget", (current) => ({ ...readWidget(current), ...changes }));
		}
		if (patch.timezone !== undefined) {
			const timezone = patch.timezone;
			await applicationConfigStore.update(applicationId, "general", () => ({ timezone }));
		}
		return this.get(applicationId);
	}
}
