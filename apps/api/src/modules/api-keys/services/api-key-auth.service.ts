import { tenancyConfig } from "../../../config/tenancy.js";
import { AuthenticationError } from "../../../foundation/errors/app-error.js";
import { logger } from "../../../foundation/logging/logger.js";
import type { ApiKeyPrincipal } from "../api-keys.types.js";
import type { IApiKeyRepository } from "../repositories/api-key.repository.interface.js";
import type { ApiKeyService } from "./api-key.service.js";

export class ApiKeyAuthService {
	constructor(private readonly deps: { apiKeyRepository: IApiKeyRepository; apiKeyService: ApiKeyService }) {}

	async authenticate(input: { authorization?: string; apiKeyHeader?: string }): Promise<ApiKeyPrincipal> {
		const { apiKeyRepository, apiKeyService } = this.deps;
		const rejected = () => new AuthenticationError("Invalid API key");

		const key = apiKeyService.extract(input);
		if (!key) throw rejected();

		const record = await apiKeyRepository.findAuthRecord(apiKeyService.hash(key));
		const now = new Date();
		if (
			!record ||
			record.revokedAt ||
			(record.expiresAt && record.expiresAt <= now) ||
			record.application.archivedAt ||
			record.organizationArchivedAt
		) {
			throw rejected();
		}

		const staleBefore = new Date(now.getTime() - tenancyConfig.apiKey.lastUsedThrottleMs);
		if (!record.lastUsedAt || record.lastUsedAt < staleBefore) {
			apiKeyRepository.touchLastUsed(record.id, staleBefore).catch((error: unknown) => {
				logger.warn("api_key.touch_failed", { keyId: record.id, error });
			});
		}

		return {
			keyId: record.id,
			keyPrefix: record.prefix,
			scopes: record.scopes,
			organizationId: record.organizationId,
			application: {
				id: record.application.id,
				name: record.application.name,
				slug: record.application.slug,
				allowedOrigins: record.application.allowedOrigins,
			},
		};
	}
}
