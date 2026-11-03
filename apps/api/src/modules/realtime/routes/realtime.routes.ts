import { Router } from "express";

import { tenancyConfig } from "../../../config/tenancy.js";
import { delegate } from "../../../foundation/http/locals.js";
import { noStore } from "../../../foundation/middleware/no-store.js";
import { clientIp, rateLimit } from "../../../foundation/middleware/rate-limit.js";
import { validateParams } from "../../../foundation/validation/validate.js";
import { apiKeyRateKey, requireApiKey } from "../../api-keys/middleware/require-api-key.js";
import { requireAuth } from "../../auth/middleware/require-auth.js";
import { requireApplication } from "../../tenancy/middleware/tenant-access.js";
import { aiParamsSchema, serviceAiParamsSchema } from "../../ai/validators/ai.validator.js";
import type { RealtimeController } from "../controllers/realtime.controller.js";

const handle = (method: Parameters<typeof delegate<RealtimeController>>[1]) =>
	delegate<RealtimeController>("realtimeController", method);

const serviceIpLimit = rateLimit({ name: "api-key:ip", ...tenancyConfig.rateLimits.apiKeyIp, key: (request) => clientIp(request) });
const serviceKeyLimit = rateLimit({ name: "api-key:requests", ...tenancyConfig.rateLimits.apiKeyRequests, key: apiKeyRateKey });

export function realtimeRouter(): Router {
	const router = Router();

	router.get(
		"/organizations/:organizationId/applications/:applicationId/events",
		requireAuth,
		requireApplication("conversation.read"),
		validateParams(aiParamsSchema),
		handle("agentEvents"),
	);
	router.get(
		"/service/conversations/:conversationId/events",
		noStore,
		serviceIpLimit,
		requireApiKey("chat"),
		serviceKeyLimit,
		validateParams(serviceAiParamsSchema),
		handle("customerEvents"),
	);

	return router;
}
