import { ConflictError, NotFoundError } from "../../../foundation/errors/app-error.js";
import type { MessageView } from "../conversation.types.js";
import type { IConversationRepository } from "../repositories/conversation.repository.interface.js";

export class SendCustomerMessageUseCase {
	constructor(private readonly deps: { conversationRepository: IConversationRepository }) {}

	async execute(input: { applicationId: string; conversationId: string; body: string }): Promise<{ message: MessageView; reopened: boolean }> {
		const result = await this.deps.conversationRepository.appendMessage(input.applicationId, input.conversationId, {
			kind: "customer",
			body: input.body,
		});
		if (result.result === "ok") return { message: result.message, reopened: result.reopened };
		if (result.result === "invalid") throw new ConflictError(result.reason);
		throw new NotFoundError("Conversation not found");
	}
}
