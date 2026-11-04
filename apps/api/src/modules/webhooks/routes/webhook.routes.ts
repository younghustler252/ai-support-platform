import { Router } from "express";

import { tenancyConfig } from "../../../config/tenancy.js";
import { delegate } from "../../../foundation/http/locals.js";
import { noStore } from "../../../foundation/middleware/no-store.js";
import { rateLimit } from "../../../foundation/middleware/rate-limit.js";
import { validateBody, validateParams, validateQuery } from "../../../foundation/validation/validate.js";
import { requireAuth } from "../../auth/middleware/require-auth.js";
import { userRateKey } from "../../tenancy/http/tenant-http.js";
import { requireApplication } from "../../tenancy/middleware/tenant-access.js";
import type { WebhookController } from "../controllers/webhook.controller.js";
import {
	createWebhookSchema,
	deliveryParamsSchema,
	listDeliveriesQuerySchema,
	updateWebhookSchema,
	webhookParamsSchema,
} from "../validators/webhook.validator.js";

const handle = (method: Parameters<typeof delegate<WebhookController>>[1]) =>
	delegate<WebhookController>("webhookController", method);

const manageLimit = rateLimit({ name: "webhook:manage:user", ...tenancyConfig.rateLimits.manageWebhooks, key: userRateKey });

export function webhookRouter(): Router {
	const router = Router();
	const base = "/organizations/:organizationId/applications/:applicationId/webhooks";
	const item = `${base}/:endpointId`;
	const read = [requireAuth, requireApplication("webhook.read")] as const;
	const manage = [requireAuth, requireApplication("webhook.manage")] as const;

	router.get(base, ...read, handle("list"));
	router.get(item, ...read, validateParams(webhookParamsSchema), handle("get"));
	router.get(`${item}/deliveries`, ...read, validateParams(webhookParamsSchema), validateQuery(listDeliveriesQuerySchema), handle("listDeliveries"));
	router.post(base, ...manage, validateBody(createWebhookSchema), manageLimit, noStore, handle("create"));
	router.patch(item, ...manage, validateParams(webhookParamsSchema), validateBody(updateWebhookSchema), manageLimit, handle("update"));
	router.delete(item, ...manage, validateParams(webhookParamsSchema), manageLimit, handle("remove"));
	router.post(`${item}/rotate-secret`, ...manage, validateParams(webhookParamsSchema), manageLimit, noStore, handle("rotateSecret"));
	router.post(`${item}/test`, ...manage, validateParams(webhookParamsSchema), manageLimit, handle("test"));
	router.post(`${item}/deliveries/:deliveryId/redeliver`, ...manage, validateParams(deliveryParamsSchema), manageLimit, handle("redeliver"));

	return router;
}
