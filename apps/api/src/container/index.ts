import { asClass, asFunction, asValue, createContainer, InjectionMode } from "awilix";

import { MemoryRateLimiter } from "../foundation/rate-limit/rate-limiter.js";
import { prisma } from "../infrastructure/database/prisma.js";
import { createEmailTransport } from "../infrastructure/email/email-transport.js";
import { InProcessEmailQueue } from "../infrastructure/email/in-process-email-queue.js";
import { registerAudit } from "../modules/audit/audit.container.js";
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
	rateLimiter: asValue(new MemoryRateLimiter()),
	emailTransport: asFunction(createEmailTransport).singleton(),
	emailQueue: asClass(InProcessEmailQueue).singleton(),
});

registerPlatformSettings(container);
registerAudit(container);
registerAuth(container);
