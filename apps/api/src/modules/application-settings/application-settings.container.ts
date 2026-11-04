import { asClass, type AwilixContainer } from "awilix";

import { ApplicationConfigStore } from "./application-config.store.js";
import { SettingsController } from "./controllers/settings.controller.js";
import { SettingsRepositoryImpl } from "./repositories/settings.repository.js";
import { GetApplicationSettingsUseCase, GetWidgetConfigUseCase, UpdateApplicationSettingsUseCase } from "./usecases/settings-usecases.js";

export function registerApplicationSettings(container: AwilixContainer): void {
	container.register({
		applicationConfigStore: asClass(ApplicationConfigStore).scoped(),
		settingsRepository: asClass(SettingsRepositoryImpl).scoped(),
		getApplicationSettingsUseCase: asClass(GetApplicationSettingsUseCase).scoped(),
		updateApplicationSettingsUseCase: asClass(UpdateApplicationSettingsUseCase).scoped(),
		getWidgetConfigUseCase: asClass(GetWidgetConfigUseCase).scoped(),
		settingsController: asClass(SettingsController).scoped(),
	});
}
