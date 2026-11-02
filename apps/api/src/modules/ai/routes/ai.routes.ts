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
import type { AiController } from "../controllers/ai.controller.js";
import { aiParamsSchema, serviceAiParamsSchema, updateAiSettingsSchema } from "../validators/ai.validator.js";

const handle = (method: Parameters<typeof delegate<AiController>>[1]) => delegate<AiController>("aiController", method);

const manageLimit = rateLimit({ name: "ai:settings:user", ...tenancyConfig.rateLimits.manageKnowledge, key: userRateKey });
const serviceIpLimit = rateLimit({ name: "api-key:ip", ...tenancyConfig.rateLimits.apiKeyIp, key: (request) => clientIp(request) });
const serviceKeyLimit = rateLimit({ name: "api-key:requests", ...tenancyConfig.rateLimits.apiKeyRequests, key: apiKeyRateKey });
const aiReplyLimit = rateLimit({ name: "ai:reply:key", ...tenancyConfig.rateLimits.aiReply, key: apiKeyRateKey });

export function aiRouter(): Router {
	const router = Router();
	const settings = "/organizations/:organizationId/applications/:applicationId/ai/settings";

	router.get(settings, requireAuth, requireApplication("application.read"), validateParams(aiParamsSchema), handle("getSettings"));
	router.put(
		settings,
		requireAuth,
		requireApplication("application.update"),
		validateParams(aiParamsSchema),
		validateBody(updateAiSettingsSchema),
		manageLimit,
		handle("updateSettings"),
	);

	router.post(
		"/service/conversations/:conversationId/ai-reply",
		noStore,
		serviceIpLimit,
		requireApiKey("chat"),
		serviceKeyLimit,
		aiReplyLimit,
		validateParams(serviceAiParamsSchema),
		handle("reply"),
	);

	return router;
}
