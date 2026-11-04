import { Router } from "express";
import type { AwilixContainer } from "awilix";

import { aiRouter } from "../modules/ai/routes/ai.routes.js";
import { apiKeyRouter } from "../modules/api-keys/routes/api-key.routes.js";
import { applicationRouter } from "../modules/applications/routes/application.routes.js";
import { authRouter } from "../modules/auth/routes/auth.routes.js";
import { planRouter } from "../modules/entitlements/routes/plan.routes.js";
import { knowledgeRouter } from "../modules/knowledge/routes/knowledge.routes.js";
import { membershipRouter } from "../modules/memberships/routes/membership.routes.js";
import { conversationRouter } from "../modules/conversations/routes/conversation.routes.js";
import { customerRouter } from "../modules/customers/routes/customer.routes.js";
import { organizationRouter } from "../modules/organizations/routes/organization.routes.js";
import { realtimeRouter } from "../modules/realtime/routes/realtime.routes.js";
import { auditRouter } from "../modules/audit/routes/audit.routes.js";
import { settingsRouter } from "../modules/application-settings/routes/settings.routes.js";
import { notificationRouter } from "../modules/notifications/routes/notification.routes.js";
import { webhookRouter } from "../modules/webhooks/routes/webhook.routes.js";
import { roleRouter } from "../modules/rbac/routes/role.routes.js";
import { publicSettingsRouter } from "../modules/platform-settings/routes/public-settings.routes.js";

export function apiRouter(container: AwilixContainer): Router {
	const router = Router();

	router.use("/platform", publicSettingsRouter(container));
	router.use("/auth", authRouter());
	router.use(organizationRouter());
	router.use(membershipRouter());
	router.use(applicationRouter());
	router.use(planRouter());
	router.use(apiKeyRouter());
	router.use(roleRouter());
	router.use(customerRouter());
	router.use(conversationRouter());
	router.use(knowledgeRouter());
	router.use(aiRouter());
	router.use(realtimeRouter());
	router.use(webhookRouter());
	router.use(auditRouter());
	router.use(notificationRouter());
	router.use(settingsRouter());

	return router;
}
