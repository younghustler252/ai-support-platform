import { Router } from "express";

import { tenancyConfig } from "../../../config/tenancy.js";
import { delegate } from "../../../foundation/http/locals.js";
import { noStore } from "../../../foundation/middleware/no-store.js";
import { clientIp, rateLimit } from "../../../foundation/middleware/rate-limit.js";
import { validateBody, validateParams } from "../../../foundation/validation/validate.js";
import { requireAuth } from "../../auth/middleware/require-auth.js";
import { userRateKey } from "../../tenancy/http/tenant-http.js";
import { requireApplication } from "../../tenancy/middleware/tenant-access.js";
import type { ApiKeyController } from "../controllers/api-key.controller.js";
import { apiKeyRateKey, requireApiKey } from "../middleware/require-api-key.js";
import { apiKeyParamsSchema, createApiKeySchema, rotateApiKeySchema } from "../validators/api-key.validator.js";

const manageLimit = rateLimit({
	name: "api-key:manage:user",
	...tenancyConfig.rateLimits.manageApiKeys,
	key: userRateKey,
});
const serviceIpLimit = rateLimit({
	name: "api-key:ip",
	...tenancyConfig.rateLimits.apiKeyIp,
	key: (request) => clientIp(request),
});
const serviceKeyLimit = rateLimit({
	name: "api-key:requests",
	...tenancyConfig.rateLimits.apiKeyRequests,
	key: apiKeyRateKey,
});

const handle = (method: Parameters<typeof delegate<ApiKeyController>>[1]) =>
	delegate<ApiKeyController>("apiKeyController", method);

export function apiKeyRouter(): Router {
	const router = Router();
	const base = "/organizations/:organizationId/applications/:applicationId/api-keys";

	router.post(
		base,
		requireAuth,
		requireApplication("api-key.manage"),
		validateBody(createApiKeySchema),
		manageLimit,
		noStore,
		handle("create"),
	);
	router.get(base, requireAuth, requireApplication("api-key.read"), handle("list"));
	router.delete(
		`${base}/:keyId`,
		requireAuth,
		requireApplication("api-key.manage"),
		validateParams(apiKeyParamsSchema),
		handle("revoke"),
	);
	router.post(
		`${base}/:keyId/rotate`,
		requireAuth,
		requireApplication("api-key.manage"),
		validateParams(apiKeyParamsSchema),
		validateBody(rotateApiKeySchema),
		manageLimit,
		noStore,
		handle("rotate"),
	);

	router.get("/service/application", noStore, serviceIpLimit, requireApiKey(), serviceKeyLimit, handle("serviceApplication"));

	return router;
}
