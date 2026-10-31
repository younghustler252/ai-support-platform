import { Router } from "express";

import { tenancyConfig } from "../../../config/tenancy.js";
import { delegate } from "../../../foundation/http/locals.js";
import { rateLimit } from "../../../foundation/middleware/rate-limit.js";
import { validateBody } from "../../../foundation/validation/validate.js";
import { requireAuth } from "../../auth/middleware/require-auth.js";
import { userRateKey } from "../../tenancy/http/tenant-http.js";
import { requireApplication, requireOrganization } from "../../tenancy/middleware/tenant-access.js";
import type { ApplicationController } from "../controllers/application.controller.js";
import { createApplicationSchema, updateApplicationSchema } from "../validators/application.validator.js";

const createLimit = rateLimit({
	name: "application:create:user",
	...tenancyConfig.rateLimits.createApplication,
	key: userRateKey,
});

const handle = (method: Parameters<typeof delegate<ApplicationController>>[1]) =>
	delegate<ApplicationController>("applicationController", method);

export function applicationRouter(): Router {
	const router = Router();
	const base = "/organizations/:organizationId/applications";

	router.post(
		base,
		requireAuth,
		requireOrganization("application.create"),
		validateBody(createApplicationSchema),
		createLimit,
		handle("create"),
	);
	router.get(base, requireAuth, requireOrganization("application.list"), handle("list"));
	router.get(`${base}/:applicationId`, requireAuth, requireApplication("application.read"), handle("get"));
	router.patch(
		`${base}/:applicationId`,
		requireAuth,
		requireApplication("application.update"),
		validateBody(updateApplicationSchema),
		handle("update"),
	);
	router.delete(`${base}/:applicationId`, requireAuth, requireApplication("application.archive"), handle("archive"));

	return router;
}
