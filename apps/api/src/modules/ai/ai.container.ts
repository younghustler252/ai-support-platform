import { asClass, asFunction, type AwilixContainer } from "awilix";

import { AiController } from "./controllers/ai.controller.js";
import { createAiProvider } from "./providers/ai-providers.js";
import { AiSettingsRepositoryImpl, AiUsageRepositoryImpl } from "./repositories/ai.repositories.js";
import { GetAiSettingsUseCase, UpdateAiSettingsUseCase } from "./usecases/ai-settings.usecases.js";
import { GenerateAiReplyUseCase } from "./usecases/generate-ai-reply.usecase.js";

export function registerAi(container: AwilixContainer): void {
	container.register({
		aiProvider: asFunction(createAiProvider).singleton(),
		aiSettingsRepository: asClass(AiSettingsRepositoryImpl).scoped(),
		aiUsageRepository: asClass(AiUsageRepositoryImpl).scoped(),
		getAiSettingsUseCase: asClass(GetAiSettingsUseCase).scoped(),
		updateAiSettingsUseCase: asClass(UpdateAiSettingsUseCase).scoped(),
		generateAiReplyUseCase: asClass(GenerateAiReplyUseCase).scoped(),
		aiController: asClass(AiController).scoped(),
	});
}
