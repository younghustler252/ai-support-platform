import type { Request, Response } from "express";

import { apiKeyContext } from "../../api-keys/middleware/require-api-key.js";
import { authContext, requestMeta, validatedBody, validatedParams } from "../../auth/http/auth-http.js";
import { toPublicMessage } from "../../conversations/usecases/public-message.js";
import { tenantContext } from "../../tenancy/http/tenant-http.js";
import type { GetAiSettingsUseCase, UpdateAiSettingsUseCase } from "../usecases/ai-settings.usecases.js";
import type { GenerateAiReplyUseCase } from "../usecases/generate-ai-reply.usecase.js";
import type { UpdateAiSettingsInput } from "../validators/ai.validator.js";

interface Dependencies {
	getAiSettingsUseCase: GetAiSettingsUseCase;
	updateAiSettingsUseCase: UpdateAiSettingsUseCase;
	generateAiReplyUseCase: GenerateAiReplyUseCase;
}

export class AiController {
	constructor(private readonly deps: Dependencies) {}

	getSettings = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		response.json({ data: { settings: await this.deps.getAiSettingsUseCase.execute(applicationId as string) } });
	};

	updateSettings = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, applicationId } = tenantContext(response);
		const patch = validatedBody<UpdateAiSettingsInput>(response);
		const settings = await this.deps.updateAiSettingsUseCase.execute(
			{ organizationId, applicationId: applicationId as string, actorId: user.id, patch },
			requestMeta(request),
		);
		response.json({ data: { settings } });
	};

	reply = async (_request: Request, response: Response): Promise<void> => {
		const { conversationId } = validatedParams<{ conversationId: string }>(response);
		const result = await this.deps.generateAiReplyUseCase.execute({
			applicationId: apiKeyContext(response).application.id,
			conversationId,
		});
		const message = result.outcome === "skipped" ? null : result.message ? toPublicMessage(result.message) : null;
		response.json({
			data: {
				outcome: result.outcome,
				...(result.outcome === "escalated" ? { reason: result.reason } : {}),
				message,
			},
		});
	};
}
