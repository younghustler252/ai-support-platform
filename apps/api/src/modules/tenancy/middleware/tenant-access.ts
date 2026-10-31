import type { RequestHandler } from "express";
import type { AwilixContainer } from "awilix";
import { z } from "zod";

import { parseInput } from "../../../foundation/validation/validate.js";
import { authContext } from "../../auth/http/auth-http.js";
import { setTenantContext } from "../http/tenant-http.js";
import type { ApplicationAction, OrganizationAction } from "../policies.js";
import type { Authorizer } from "../services/authorizer.service.js";

const idSchema = z.uuid();

export function requireOrganization(action: OrganizationAction): RequestHandler {
	return async (request, response, next) => {
		const organizationId = parseInput(idSchema, request.params.organizationId);
		const { user } = authContext(response);
		const authorizer = (response.locals.scope as AwilixContainer).resolve<Authorizer>("authorizer");

		const access = await authorizer.organization(user.id, organizationId, action);
		setTenantContext(response, {
			organizationId: access.organizationId,
			applicationId: null,
			organizationRole: access.role,
			role: access.role,
		});
		next();
	};
}

export function requireApplication(action: ApplicationAction): RequestHandler {
	return async (request, response, next) => {
		const organizationId = parseInput(idSchema, request.params.organizationId);
		const applicationId = parseInput(idSchema, request.params.applicationId);
		const { user } = authContext(response);
		const authorizer = (response.locals.scope as AwilixContainer).resolve<Authorizer>("authorizer");

		const access = await authorizer.application(user.id, organizationId, applicationId, action);
		setTenantContext(response, {
			organizationId: access.organizationId,
			applicationId: access.applicationId,
			organizationRole: access.organizationRole,
			role: access.role,
		});
		next();
	};
}
