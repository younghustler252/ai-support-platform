import { createContainer, InjectionMode } from "awilix";

import { registerPlatformSettings } from "../modules/platform-settings/platform-settings.container.js";

export const container = createContainer({
	injectionMode: InjectionMode.PROXY,
	strict: true,
});

registerPlatformSettings(container);
