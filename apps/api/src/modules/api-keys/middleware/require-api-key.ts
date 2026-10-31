import type { Request, RequestHandler, Response } from "express";
import type { AwilixContainer } from "awilix";

import type { ApiKeyScope } from "../../../config/tenancy.js";
import type { RequestContext } from "../../../foundation/context/request-context.js";
import { ForbiddenError } from "../../../foundation/errors/app-error.js";
import type { ApiKeyPrincipal } from "../api-keys.types.js";
import type { ApiKeyAuthService } from "../services/api-key-auth.service.js";

export function apiKeyContext(response: Response): ApiKeyPrincipal {
	return response.locals.apiKey as ApiKeyPrincipal;
}

export function apiKeyRateKey(_request: Request, response: Response): string | null {
	return (response.locals.apiKey as ApiKeyPrincipal | undefined)?.keyId ?? null;
}

export function requireApiKey(scope?: ApiKeyScope): RequestHandler {
	return async (request, response, next) => {
		const service = (response.locals.scope as AwilixContainer).resolve<ApiKeyAuthService>("apiKeyAuthService");
		const principal = await service.authenticate({
			authorization: request.get("authorization"),
			apiKeyHeader: request.get("x-api-key"),
		});
		if (scope && !principal.scopes.includes(scope)) throw new ForbiddenError("API key lacks the required scope");

		response.locals.apiKey = principal;
		const context = response.locals.requestContext as RequestContext | undefined;
		if (context) {
			context.organizationId = principal.organizationId;
			context.applicationId = principal.application.id;
		}
		next();
	};
}
