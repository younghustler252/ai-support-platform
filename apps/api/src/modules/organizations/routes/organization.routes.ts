import { Router } from "express";

import { tenancyConfig } from "../../../config/tenancy.js";
import { delegate } from "../../../foundation/http/locals.js";
import { rateLimit } from "../../../foundation/middleware/rate-limit.js";
import { validateBody } from "../../../foundation/validation/validate.js";
import { requireAuth } from "../../auth/middleware/require-auth.js";
import { userRateKey } from "../../tenancy/http/tenant-http.js";
import { requireOrganization } from "../../tenancy/middleware/tenant-access.js";
import type { OrganizationController } from "../controllers/organization.controller.js";
import { createOrganizationSchema, updateOrganizationSchema } from "../validators/organization.validator.js";

const createLimit = rateLimit({
	name: "organization:create:user",
	...tenancyConfig.rateLimits.createOrganization,
	key: userRateKey,
});

const handle = (method: Parameters<typeof delegate<OrganizationController>>[1]) =>
	delegate<OrganizationController>("organizationController", method);

export function organizationRouter(): Router {
	const router = Router();

	router.post("/organizations", requireAuth, validateBody(createOrganizationSchema), createLimit, handle("create"));
	router.get("/organizations", requireAuth, handle("list"));
	router.get("/organizations/:organizationId", requireAuth, requireOrganization("organization.read"), handle("get"));
	router.patch(
		"/organizations/:organizationId",
		requireAuth,
		requireOrganization("organization.update"),
		validateBody(updateOrganizationSchema),
		handle("update"),
	);
	router.delete(
		"/organizations/:organizationId",
		requireAuth,
		requireOrganization("organization.archive"),
		handle("archive"),
	);

	return router;
}
