import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { IApiKeyRepository } from "../repositories/api-key.repository.interface.js";

interface Input {
	organizationId: string;
	applicationId: string;
	keyId: string;
	actorId: string;
}

export class RevokeApiKeyUseCase {
	constructor(private readonly deps: { apiKeyRepository: IApiKeyRepository; auditService: AuditRecorder }) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<{ revoked: true }> {
		if (!(await this.deps.apiKeyRepository.revoke(input.applicationId, input.keyId))) {
			throw new NotFoundError("API key not found");
		}
		await this.deps.auditService.record({
			actorUserId: input.actorId,
			action: "api_key.revoked",
			resourceType: "ApiKey",
			resourceId: input.keyId,
			metadata: auditMetadata(meta, { organizationId: input.organizationId, applicationId: input.applicationId }),
		});
		return { revoked: true };
	}
}
