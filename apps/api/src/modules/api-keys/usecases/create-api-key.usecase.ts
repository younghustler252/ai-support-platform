import { tenancyConfig } from "../../../config/tenancy.js";
import { LimitExceededError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { ApiKeyView, IApiKeyRepository } from "../repositories/api-key.repository.interface.js";
import type { ApiKeyService } from "../services/api-key.service.js";

interface Input {
	organizationId: string;
	applicationId: string;
	actorId: string;
	name: string;
	scopes: string[];
	expiresAt?: Date;
}

export class CreateApiKeyUseCase {
	constructor(private readonly deps: {
		apiKeyRepository: IApiKeyRepository;
		apiKeyService: ApiKeyService;
		auditService: AuditRecorder;
	}) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<{ apiKey: ApiKeyView; key: string }> {
		const { apiKeyRepository, apiKeyService, auditService } = this.deps;

		if ((await apiKeyRepository.countActive(input.applicationId)) >= tenancyConfig.limits.apiKeysPerApplication) {
			throw new LimitExceededError("This application has reached its API key limit; revoke an unused key first");
		}

		const generated = apiKeyService.generate();
		const apiKey = await apiKeyRepository.create({
			applicationId: input.applicationId,
			name: input.name,
			prefix: generated.prefix,
			keyHash: generated.hash,
			scopes: input.scopes,
			createdByUserId: input.actorId,
			expiresAt: input.expiresAt ?? null,
		});

		await auditService.record({
			actorUserId: input.actorId,
			action: "api_key.created",
			resourceType: "ApiKey",
			resourceId: apiKey.id,
			metadata: auditMetadata(meta, {
				organizationId: input.organizationId,
				applicationId: input.applicationId,
				prefix: apiKey.prefix,
				scopes: input.scopes.join(","),
			}),
		});
		return { apiKey, key: generated.key };
	}
}
