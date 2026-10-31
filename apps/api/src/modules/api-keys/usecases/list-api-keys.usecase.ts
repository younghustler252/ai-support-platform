import type { ApiKeyView, IApiKeyRepository } from "../repositories/api-key.repository.interface.js";

export class ListApiKeysUseCase {
	constructor(private readonly deps: { apiKeyRepository: IApiKeyRepository }) {}

	execute(applicationId: string): Promise<ApiKeyView[]> {
		return this.deps.apiKeyRepository.list(applicationId);
	}
}
