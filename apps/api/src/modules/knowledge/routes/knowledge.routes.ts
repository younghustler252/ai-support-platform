import { Router } from "express";

import { tenancyConfig } from "../../../config/tenancy.js";
import { delegate } from "../../../foundation/http/locals.js";
import { noStore } from "../../../foundation/middleware/no-store.js";
import { clientIp, rateLimit } from "../../../foundation/middleware/rate-limit.js";
import { validateBody, validateParams, validateQuery } from "../../../foundation/validation/validate.js";
import { apiKeyRateKey, requireApiKey } from "../../api-keys/middleware/require-api-key.js";
import { requireAuth } from "../../auth/middleware/require-auth.js";
import { userRateKey } from "../../tenancy/http/tenant-http.js";
import { requireApplication } from "../../tenancy/middleware/tenant-access.js";
import type { KnowledgeController } from "../controllers/knowledge.controller.js";
import {
	articleParamsSchema,
	createArticleSchema,
	listArticlesQuerySchema,
	searchKnowledgeQuerySchema,
	updateArticleSchema,
} from "../validators/knowledge.validator.js";

const handle = (method: Parameters<typeof delegate<KnowledgeController>>[1]) =>
	delegate<KnowledgeController>("knowledgeController", method);

const manageLimit = rateLimit({ name: "knowledge:manage:user", ...tenancyConfig.rateLimits.manageKnowledge, key: userRateKey });
const serviceIpLimit = rateLimit({ name: "api-key:ip", ...tenancyConfig.rateLimits.apiKeyIp, key: (request) => clientIp(request) });
const serviceKeyLimit = rateLimit({ name: "api-key:requests", ...tenancyConfig.rateLimits.apiKeyRequests, key: apiKeyRateKey });

export function knowledgeRouter(): Router {
	const router = Router();
	const base = "/organizations/:organizationId/applications/:applicationId/knowledge/articles";
	const item = `${base}/:articleId`;

	router.get(base, requireAuth, requireApplication("knowledge.read"), validateQuery(listArticlesQuerySchema), handle("list"));
	router.get(item, requireAuth, requireApplication("knowledge.read"), validateParams(articleParamsSchema), handle("get"));
	router.post(base, requireAuth, requireApplication("knowledge.manage"), validateBody(createArticleSchema), manageLimit, handle("create"));
	router.patch(
		item,
		requireAuth,
		requireApplication("knowledge.manage"),
		validateParams(articleParamsSchema),
		validateBody(updateArticleSchema),
		manageLimit,
		handle("update"),
	);
	router.post(`${item}/publish`, requireAuth, requireApplication("knowledge.manage"), validateParams(articleParamsSchema), manageLimit, handle("publish"));
	router.post(`${item}/unpublish`, requireAuth, requireApplication("knowledge.manage"), validateParams(articleParamsSchema), manageLimit, handle("unpublish"));
	router.delete(item, requireAuth, requireApplication("knowledge.manage"), validateParams(articleParamsSchema), manageLimit, handle("remove"));

	router.get(
		"/service/knowledge/search",
		noStore,
		serviceIpLimit,
		requireApiKey("knowledge:read"),
		serviceKeyLimit,
		validateQuery(searchKnowledgeQuerySchema),
		handle("searchService"),
	);

	return router;
}
