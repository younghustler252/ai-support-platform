import { asValue, createContainer, InjectionMode } from "awilix";

import { prisma } from "../infrastructure/database/prisma.js";
import { registerAuth } from "../modules/auth/auth.container.js";
import { registerPlatformSettings } from "../modules/platform-settings/platform-settings.container.js";

export const container = createContainer({
	injectionMode: InjectionMode.PROXY,
	strict: true,
});

// One shared Prisma Client and connection pool for the application.
// Never create a new Prisma Client for each HTTP request.
container.register({
	prisma: asValue(prisma),
});

registerPlatformSettings(container);
registerAuth(container);
