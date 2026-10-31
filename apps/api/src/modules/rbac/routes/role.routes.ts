import { Router, type RequestHandler } from "express";

import { tenancyConfig } from "../../../config/tenancy.js";
import { delegate } from "../../../foundation/http/locals.js";
import { rateLimit } from "../../../foundation/middleware/rate-limit.js";
import { validateBody, validateParams } from "../../../foundation/validation/validate.js";
import { requireAuth } from "../../auth/middleware/require-auth.js";
import { userRateKey } from "../../tenancy/http/tenant-http.js";
import { requireApplication, requireOrganization } from "../../tenancy/middleware/tenant-access.js";
import type { RoleController } from "../controllers/role.controller.js";
import {
	createRoleSchema,
	roleAssignmentParamsSchema,
	roleParamsSchema,
	updateRoleSchema,
} from "../validators/role.validator.js";

const manageLimit = rateLimit({
	name: "role:manage:user",
	...tenancyConfig.rateLimits.manageRoles,
	key: userRateKey,
});

const handle = (method: Parameters<typeof delegate<RoleController>>[1]) =>
	delegate<RoleController>("roleController", method);

interface Guards {
	read: RequestHandler;
	manage: RequestHandler;
	assign: RequestHandler;
}

function mount(router: Router, base: string, guards: Guards): void {
	router.get(`${base}/permissions`, requireAuth, guards.read, handle("listPermissions"));
	router.get(base, requireAuth, guards.read, handle("list"));
	router.post(base, requireAuth, guards.manage, validateBody(createRoleSchema), manageLimit, handle("create"));
	router.get(`${base}/:roleId`, requireAuth, guards.read, validateParams(roleParamsSchema), handle("get"));
	router.patch(
		`${base}/:roleId`,
		requireAuth,
		guards.manage,
		validateParams(roleParamsSchema),
		validateBody(updateRoleSchema),
		manageLimit,
		handle("update"),
	);
	router.delete(`${base}/:roleId`, requireAuth, guards.manage, validateParams(roleParamsSchema), manageLimit, handle("remove"));
	router.get(
		`${base}/:roleId/members`,
		requireAuth,
		guards.read,
		validateParams(roleParamsSchema),
		handle("listAssignments"),
	);
	router.put(
		`${base}/:roleId/members/:userId`,
		requireAuth,
		guards.assign,
		validateParams(roleAssignmentParamsSchema),
		manageLimit,
		handle("assign"),
	);
	router.delete(
		`${base}/:roleId/members/:userId`,
		requireAuth,
		guards.assign,
		validateParams(roleAssignmentParamsSchema),
		manageLimit,
		handle("unassign"),
	);
}

export function roleRouter(): Router {
	const router = Router();

	mount(router, "/organizations/:organizationId/roles", {
		read: requireOrganization("role.read"),
		manage: requireOrganization("role.manage"),
		assign: requireOrganization("role.assign"),
	});
	mount(router, "/organizations/:organizationId/applications/:applicationId/roles", {
		read: requireApplication("application.role.read"),
		manage: requireApplication("application.role.manage"),
		assign: requireApplication("application.role.assign"),
	});

	return router;
}
