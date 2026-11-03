import { ConflictError, NotFoundError } from "../../../foundation/errors/app-error.js";
import { scheduleSafely, type AiReplyScheduler } from "../../ai/ai-reply-scheduler.js";
import type { MessageView } from "../conversation.types.js";
import type { IConversationRepository } from "../repositories/conversation.repository.interface.js";

export class SendCustomerMessageUseCase {
	constructor(private readonly deps: { conversationRepository: IConversationRepository; aiReplyScheduler: AiReplyScheduler }) {}

	async execute(input: { applicationId: string; conversationId: string; body: string }): Promise<{ message: MessageView; reopened: boolean }> {
		const result = await this.deps.conversationRepository.appendMessage(input.applicationId, input.conversationId, {
			kind: "customer",
			body: input.body,
		});
		if (result.result === "ok") {
			if (!result.reopened) {
				await scheduleSafely(this.deps.aiReplyScheduler, {
					applicationId: input.applicationId,
					conversationId: input.conversationId,
					messageId: result.message.id,
				});
			}
			return { message: result.message, reopened: result.reopened };
		}
		if (result.result === "invalid") throw new ConflictError(result.reason);
		throw new NotFoundError("Conversation not found");
	}
}
