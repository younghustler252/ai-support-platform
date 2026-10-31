import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { ApiKeyView, IApiKeyRepository } from "../repositories/api-key.repository.interface.js";
import type { ApiKeyService } from "../services/api-key.service.js";

interface Input {
	organizationId: string;
	applicationId: string;
	keyId: string;
	actorId: string;
	graceHours: number;
}

export class RotateApiKeyUseCase {
	constructor(private readonly deps: {
		apiKeyRepository: IApiKeyRepository;
		apiKeyService: ApiKeyService;
		auditService: AuditRecorder;
	}) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<{ apiKey: ApiKeyView; key: string }> {
		const { apiKeyRepository, apiKeyService, auditService } = this.deps;

		const previous = await apiKeyRepository.findOwned(input.applicationId, input.keyId);
		if (!previous || previous.revokedAt) throw new NotFoundError("API key not found");

		const generated = apiKeyService.generate();
		const apiKey = await apiKeyRepository.rotate({
			applicationId: input.applicationId,
			keyId: input.keyId,
			next: {
				applicationId: input.applicationId,
				name: previous.name,
				prefix: generated.prefix,
				keyHash: generated.hash,
				scopes: previous.scopes,
				createdByUserId: input.actorId,
				expiresAt: previous.expiresAt,
			},
			graceUntil: input.graceHours > 0 ? new Date(Date.now() + input.graceHours * 3_600_000) : null,
		});
		if (!apiKey) throw new NotFoundError("API key not found");

		await auditService.record({
			actorUserId: input.actorId,
			action: "api_key.rotated",
			resourceType: "ApiKey",
			resourceId: input.keyId,
			metadata: auditMetadata(meta, {
				organizationId: input.organizationId,
				applicationId: input.applicationId,
				newKeyId: apiKey.id,
				graceHours: input.graceHours,
			}),
		});
		return { apiKey, key: generated.key };
	}
}
