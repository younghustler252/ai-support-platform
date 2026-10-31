import type { Request, Response } from "express";

import type { RequestContext } from "../../../foundation/context/request-context.js";
import type { AuthContext } from "../../auth/auth.types.js";
import type { TenantContext } from "../tenancy.types.js";

export function tenantContext(response: Response): TenantContext {
	return response.locals.tenant as TenantContext;
}

export function setTenantContext(response: Response, tenant: TenantContext): void {
	response.locals.tenant = tenant;
	const context = response.locals.requestContext as RequestContext | undefined;
	if (context) {
		context.organizationId = tenant.organizationId;
		context.applicationId = tenant.applicationId;
	}
}

export function userRateKey(_request: Request, response: Response): string | null {
	return (response.locals.auth as AuthContext | undefined)?.user.id ?? null;
}
