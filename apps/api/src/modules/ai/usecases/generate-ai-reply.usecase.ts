import { tenancyConfig } from "../../../config/tenancy.js";
import { ConflictError, NotFoundError } from "../../../foundation/errors/app-error.js";
import { logger } from "../../../foundation/logging/logger.js";
import type { IEntitlementService } from "../../entitlements/services/entitlement.service.js";
import type { MessageView } from "../../conversations/conversation.types.js";
import type { IConversationRepository } from "../../conversations/repositories/conversation.repository.interface.js";
import type { IRetrievalService } from "../../retrieval/retrieval.service.js";
import { AiProviderError, type IAiProvider } from "../ai.types.js";
import { buildPrompt, interpretReply } from "../domain/prompt.js";
import type { IAiSettingsRepository, IAiUsageRepository } from "../repositories/ai.repositories.js";

const DAY = 24 * 60 * 60 * 1000;
const REQUEST_METRIC = "ai.request";

export type AiReplyResult =
	| { outcome: "replied"; message: MessageView }
	| { outcome: "escalated"; reason: "disabled" | "limit" | "no_context" | "provider_error" | "not_answerable"; message: MessageView | null }
	| { outcome: "skipped" };

interface Dependencies {
	conversationRepository: IConversationRepository;
	retrievalService: IRetrievalService;
	aiProvider: IAiProvider;
	aiSettingsRepository: IAiSettingsRepository;
	aiUsageRepository: IAiUsageRepository;
	entitlementService: IEntitlementService;
}

export class GenerateAiReplyUseCase {
	constructor(private readonly deps: Dependencies) {}

	async execute(input: { applicationId: string; conversationId: string }): Promise<AiReplyResult> {
		const { conversationRepository, retrievalService, aiProvider, aiSettingsRepository, aiUsageRepository, entitlementService } = this.deps;
		const { applicationId, conversationId } = input;

		const conversation = await conversationRepository.find(applicationId, conversationId);
		if (!conversation) throw new NotFoundError("Conversation not found");
		if (conversation.status !== "AI_ACTIVE") throw new ConflictError("The conversation is not handled by AI");

		const messages = await conversationRepository.recentMessages(applicationId, conversationId, tenancyConfig.ai.contextMessages);
		if (!messages) throw new NotFoundError("Conversation not found");
		const last = messages.at(-1);
		if (!last || last.sender !== "CUSTOMER") throw new ConflictError("There is no customer message waiting for a reply");

		const settings = await aiSettingsRepository.get(applicationId);
		if (!settings.enabled || !aiProvider.configured) return this.handoff(input, settings.fallbackMessage, "disabled");

		if (!(await entitlementService.canUseAi(applicationId))) return this.handoff(input, settings.fallbackMessage, "limit");

		const used = await aiUsageRepository.countSince(applicationId, REQUEST_METRIC, new Date(Date.now() - DAY));
		if (used >= tenancyConfig.limits.aiRepliesPerApplicationPerDay) return this.handoff(input, settings.fallbackMessage, "limit");

		const customerTexts = messages.filter((message) => message.sender === "CUSTOMER").map((message) => message.body);
		const question = customerTexts.slice(-2).join("\n");
		const passages = await retrievalService.retrieve(applicationId, question);
		if (passages.length === 0) return this.handoff(input, settings.fallbackMessage, "no_context");

		let completion;
		try {
			completion = await aiProvider.complete({
				messages: buildPrompt({ instructions: settings.instructions, passages, messages }),
				maxTokens: tenancyConfig.ai.maxOutputTokens,
				temperature: tenancyConfig.ai.temperature,
			});
		} catch (error) {
			if (!(error instanceof AiProviderError)) throw error;
			logger.warn("ai.provider_failed", { applicationId, conversationId, status: error.status ?? null });
			await aiUsageRepository.record(applicationId, REQUEST_METRIC, { outcome: "error" });
			return this.handoff(input, settings.fallbackMessage, "provider_error");
		}

		const decision = interpretReply(completion.text);
		await aiUsageRepository.record(applicationId, REQUEST_METRIC, {
			outcome: decision.kind === "answer" ? "replied" : "handoff",
			model: completion.model,
			inputTokens: completion.inputTokens,
			outputTokens: completion.outputTokens,
		});
		if (decision.kind === "handoff") return this.handoff(input, settings.fallbackMessage, "not_answerable");

		const appended = await conversationRepository.appendMessage(applicationId, conversationId, {
			kind: "ai",
			body: decision.text,
			metadata: { model: completion.model, sources: passages.length },
		});
		if (appended.result !== "ok") return { outcome: "skipped" };
		return { outcome: "replied", message: appended.message };
	}

	private async handoff(
		input: { applicationId: string; conversationId: string },
		fallback: string | null,
		reason: Extract<AiReplyResult, { outcome: "escalated" }>["reason"],
	): Promise<AiReplyResult> {
		const { conversationRepository } = this.deps;
		const appended = await conversationRepository.appendMessage(input.applicationId, input.conversationId, {
			kind: "ai",
			body: fallback ?? tenancyConfig.ai.defaultFallbackMessage,
			metadata: { handoff: reason },
		});
		if (appended.result !== "ok") return { outcome: "skipped" };
		await conversationRepository.apply(input.applicationId, input.conversationId, { type: "escalate" });
		return { outcome: "escalated", reason, message: appended.message };
	}
}
