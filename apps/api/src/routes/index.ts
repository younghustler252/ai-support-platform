import { Router } from "express";
import type { AwilixContainer } from "awilix";

import { apiKeyRouter } from "../modules/api-keys/routes/api-key.routes.js";
import { applicationRouter } from "../modules/applications/routes/application.routes.js";
import { authRouter } from "../modules/auth/routes/auth.routes.js";
import { membershipRouter } from "../modules/memberships/routes/membership.routes.js";
import { organizationRouter } from "../modules/organizations/routes/organization.routes.js";
import { publicSettingsRouter } from "../modules/platform-settings/routes/public-settings.routes.js";

export function apiRouter(container: AwilixContainer): Router {
	const router = Router();

	router.use("/platform", publicSettingsRouter(container));
	router.use("/auth", authRouter());
	router.use(organizationRouter());
	router.use(membershipRouter());
	router.use(applicationRouter());
	router.use(apiKeyRouter());

	return router;
}
