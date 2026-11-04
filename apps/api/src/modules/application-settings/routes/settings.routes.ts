import { Router } from "express";

import { tenancyConfig } from "../../../config/tenancy.js";
import { delegate } from "../../../foundation/http/locals.js";
import { noStore } from "../../../foundation/middleware/no-store.js";
import { clientIp, rateLimit } from "../../../foundation/middleware/rate-limit.js";
import { validateBody, validateParams } from "../../../foundation/validation/validate.js";
import { apiKeyRateKey, requireApiKey } from "../../api-keys/middleware/require-api-key.js";
import { requireAuth } from "../../auth/middleware/require-auth.js";
import { userRateKey } from "../../tenancy/http/tenant-http.js";
import { requireApplication } from "../../tenancy/middleware/tenant-access.js";
import type { SettingsController } from "../controllers/settings.controller.js";
import { settingsParamsSchema, updateSettingsSchema } from "../validators/settings.validator.js";

const handle = (method: Parameters<typeof delegate<SettingsController>>[1]) =>
	delegate<SettingsController>("settingsController", method);

const manageLimit = rateLimit({ name: "settings:user", ...tenancyConfig.rateLimits.manageKnowledge, key: userRateKey });
const serviceIpLimit = rateLimit({ name: "api-key:ip", ...tenancyConfig.rateLimits.apiKeyIp, key: (request) => clientIp(request) });
const serviceKeyLimit = rateLimit({ name: "api-key:requests", ...tenancyConfig.rateLimits.apiKeyRequests, key: apiKeyRateKey });

export function settingsRouter(): Router {
	const router = Router();
	const path = "/organizations/:organizationId/applications/:applicationId/settings";

	router.get(path, requireAuth, requireApplication("application.read"), validateParams(settingsParamsSchema), handle("get"));
	router.patch(
		path,
		requireAuth,
		requireApplication("application.update"),
		validateParams(settingsParamsSchema),
		validateBody(updateSettingsSchema),
		manageLimit,
		handle("update"),
	);
	router.get("/service/widget-config", noStore, serviceIpLimit, requireApiKey("chat"), serviceKeyLimit, handle("widgetConfig"));

	return router;
}
