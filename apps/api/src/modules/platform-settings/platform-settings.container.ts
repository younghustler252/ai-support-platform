import { asClass, type AwilixContainer } from "awilix";
import { PublicSettingsService } from "./services/public-settings.service.js";
import { PublicSettingsController } from "./controllers/public-settings.controller.js";
export function registerPlatformSettings(container: AwilixContainer): void { container.register({ publicSettingsService: asClass(PublicSettingsService).singleton(), publicSettingsController: asClass(PublicSettingsController).scoped() }); }
