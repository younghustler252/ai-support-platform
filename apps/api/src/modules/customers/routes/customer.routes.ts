import { Router } from "express";

import { delegate } from "../../../foundation/http/locals.js";
import { noStore } from "../../../foundation/middleware/no-store.js";
import { clientIp, rateLimit } from "../../../foundation/middleware/rate-limit.js";
import { validateBody, validateParams, validateQuery } from "../../../foundation/validation/validate.js";
import { tenancyConfig } from "../../../config/tenancy.js";
import { apiKeyRateKey, requireApiKey } from "../../api-keys/middleware/require-api-key.js";
import { requireAuth } from "../../auth/middleware/require-auth.js";
import { requireApplication } from "../../tenancy/middleware/tenant-access.js";
import type { CustomerController } from "../controllers/customer.controller.js";
import {
	customerParamsSchema,
	listCustomersQuerySchema,
	serviceCustomerParamsSchema,
	updateCustomerSchema,
	upsertServiceCustomerSchema,
} from "../validators/customer.validator.js";

const handle = (method: Parameters<typeof delegate<CustomerController>>[1]) =>
	delegate<CustomerController>("customerController", method);

const serviceIpLimit = rateLimit({ name: "api-key:ip", ...tenancyConfig.rateLimits.apiKeyIp, key: (request) => clientIp(request) });
const serviceKeyLimit = rateLimit({ name: "api-key:requests", ...tenancyConfig.rateLimits.apiKeyRequests, key: apiKeyRateKey });

export function customerRouter(): Router {
	const router = Router();
	const base = "/organizations/:organizationId/applications/:applicationId/customers";

	router.get(base, requireAuth, requireApplication("customer.read"), validateQuery(listCustomersQuerySchema), handle("list"));
	router.get(`${base}/:customerId`, requireAuth, requireApplication("customer.read"), validateParams(customerParamsSchema), handle("get"));
	router.patch(
		`${base}/:customerId`,
		requireAuth,
		requireApplication("customer.manage"),
		validateParams(customerParamsSchema),
		validateBody(updateCustomerSchema),
		handle("update"),
	);

	router.put(
		"/service/customers/:externalId",
		noStore,
		serviceIpLimit,
		requireApiKey("conversations:write"),
		serviceKeyLimit,
		validateParams(serviceCustomerParamsSchema),
		validateBody(upsertServiceCustomerSchema),
		handle("upsertService"),
	);

	return router;
}
