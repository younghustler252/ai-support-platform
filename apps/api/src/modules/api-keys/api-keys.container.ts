import { asClass, type AwilixContainer } from "awilix";

import { ApiKeyController } from "./controllers/api-key.controller.js";
import { ApiKeyRepositoryImpl } from "./repositories/api-key.repository.impl.js";
import { ApiKeyAuthService } from "./services/api-key-auth.service.js";
import { ApiKeyService } from "./services/api-key.service.js";
import { CreateApiKeyUseCase } from "./usecases/create-api-key.usecase.js";
import { ListApiKeysUseCase } from "./usecases/list-api-keys.usecase.js";
import { RevokeApiKeyUseCase } from "./usecases/revoke-api-key.usecase.js";
import { RotateApiKeyUseCase } from "./usecases/rotate-api-key.usecase.js";

export function registerApiKeys(container: AwilixContainer): void {
	container.register({
		apiKeyRepository: asClass(ApiKeyRepositoryImpl).scoped(),
		apiKeyService: asClass(ApiKeyService).singleton(),
		apiKeyAuthService: asClass(ApiKeyAuthService).scoped(),
		createApiKeyUseCase: asClass(CreateApiKeyUseCase).scoped(),
		listApiKeysUseCase: asClass(ListApiKeysUseCase).scoped(),
		revokeApiKeyUseCase: asClass(RevokeApiKeyUseCase).scoped(),
		rotateApiKeyUseCase: asClass(RotateApiKeyUseCase).scoped(),
		apiKeyController: asClass(ApiKeyController).scoped(),
	});
}
