import type { Request, Response } from "express";

import { authContext, requestMeta, validatedBody, validatedParams } from "../../auth/http/auth-http.js";
import { tenantContext } from "../../tenancy/http/tenant-http.js";
import { apiKeyContext } from "../middleware/require-api-key.js";
import type { CreateApiKeyUseCase } from "../usecases/create-api-key.usecase.js";
import type { ListApiKeysUseCase } from "../usecases/list-api-keys.usecase.js";
import type { RevokeApiKeyUseCase } from "../usecases/revoke-api-key.usecase.js";
import type { RotateApiKeyUseCase } from "../usecases/rotate-api-key.usecase.js";
import type { ApiKeyParams, CreateApiKeyInput, RotateApiKeyInput } from "../validators/api-key.validator.js";

interface Dependencies {
	createApiKeyUseCase: CreateApiKeyUseCase;
	listApiKeysUseCase: ListApiKeysUseCase;
	revokeApiKeyUseCase: RevokeApiKeyUseCase;
	rotateApiKeyUseCase: RotateApiKeyUseCase;
}

export class ApiKeyController {
	constructor(private readonly deps: Dependencies) {}

	create = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, applicationId } = tenantContext(response);
		const { name, scopes, expiresAt } = validatedBody<CreateApiKeyInput>(response);
		const result = await this.deps.createApiKeyUseCase.execute(
			{ organizationId, applicationId: applicationId as string, actorId: user.id, name, scopes, expiresAt },
			requestMeta(request),
		);
		response.status(201).json({ data: result });
	};

	list = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		response.json({ data: { apiKeys: await this.deps.listApiKeysUseCase.execute(applicationId as string) } });
	};

	revoke = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, applicationId } = tenantContext(response);
		const { keyId } = validatedParams<ApiKeyParams>(response);
		response.json({
			data: await this.deps.revokeApiKeyUseCase.execute(
				{ organizationId, applicationId: applicationId as string, keyId, actorId: user.id },
				requestMeta(request),
			),
		});
	};

	rotate = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, applicationId } = tenantContext(response);
		const { keyId } = validatedParams<ApiKeyParams>(response);
		const { graceHours } = validatedBody<RotateApiKeyInput>(response);
		const result = await this.deps.rotateApiKeyUseCase.execute(
			{ organizationId, applicationId: applicationId as string, keyId, actorId: user.id, graceHours },
			requestMeta(request),
		);
		response.status(201).json({ data: result });
	};

	serviceApplication = async (_request: Request, response: Response): Promise<void> => {
		const principal = apiKeyContext(response);
		response.json({
			data: {
				application: { ...principal.application, organizationId: principal.organizationId },
				key: { id: principal.keyId, prefix: principal.keyPrefix, scopes: principal.scopes },
			},
		});
	};
}
