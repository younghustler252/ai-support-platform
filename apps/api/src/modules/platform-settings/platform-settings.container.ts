import { asClass, type AwilixContainer } from "awilix";

import { PublicSettingsController } from "./controllers/public-settings.controller.js";
import { PublicSettingsService } from "./services/public-settings.service.js";

export function registerPlatformSettings(container: AwilixContainer): void {
	container.register({
		publicSettingsService: asClass(PublicSettingsService).singleton(),
		publicSettingsController: asClass(PublicSettingsController).scoped(),
	});
}
