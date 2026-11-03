import { Router } from "express";

import { delegate } from "../../../foundation/http/locals.js";
import { requireAuth } from "../../auth/middleware/require-auth.js";
import { requireOrganization } from "../../tenancy/middleware/tenant-access.js";
import type { PlanController } from "../controllers/plan.controller.js";

export function planRouter(): Router {
	const router = Router();
	router.get(
		"/organizations/:organizationId/plan",
		requireAuth,
		requireOrganization("organization.read"),
		delegate<PlanController>("planController", "get"),
	);
	return router;
}
