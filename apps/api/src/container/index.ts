import { asFunction, asValue, createContainer, InjectionMode } from "awilix";

import { createRateLimiter } from "../infrastructure/redis/redis-rate-limiter.js";
import { prisma } from "../infrastructure/database/prisma.js";
import { createEmailTransport } from "../infrastructure/email/email-transport.js";
import { createAiReplyScheduler, createEmailQueue } from "../infrastructure/queue/queue-factories.js";
import { registerAi } from "../modules/ai/ai.container.js";
import { registerApiKeys } from "../modules/api-keys/api-keys.container.js";
import { registerApplications } from "../modules/applications/applications.container.js";
import { registerConversations } from "../modules/conversations/conversations.container.js";
import { registerCustomers } from "../modules/customers/customers.container.js";
import { registerAudit } from "../modules/audit/audit.container.js";
import { registerAuth } from "../modules/auth/auth.container.js";
import { registerKnowledge } from "../modules/knowledge/knowledge.container.js";
import { registerMemberships } from "../modules/memberships/memberships.container.js";
import { registerOrganizations } from "../modules/organizations/organizations.container.js";
import { registerRealtime } from "../modules/realtime/realtime.container.js";
import { registerRbac } from "../modules/rbac/rbac.container.js";
import { registerPlatformSettings } from "../modules/platform-settings/platform-settings.container.js";
import { registerTenancy } from "../modules/tenancy/tenancy.container.js";

export const container = createContainer({
	injectionMode: InjectionMode.PROXY,
	strict: true,
});

// One shared Prisma Client and connection pool for the application.
// Never create a new Prisma Client for each HTTP request.
container.register({
	prisma: asValue(prisma),
	rateLimiter: asFunction(createRateLimiter).singleton(),
	emailTransport: asFunction(createEmailTransport).singleton(),
	emailQueue: asFunction(createEmailQueue).singleton(),
	aiReplyScheduler: asFunction(createAiReplyScheduler).singleton(),
});

registerPlatformSettings(container);
registerAudit(container);
registerAuth(container);
registerTenancy(container);
registerOrganizations(container);
registerMemberships(container);
registerApplications(container);
registerApiKeys(container);
registerRbac(container);
registerCustomers(container);
registerRealtime(container);
registerConversations(container);
registerKnowledge(container);
registerAi(container);


