import { ConflictError, NotFoundError } from "../../../foundation/errors/app-error.js";
import type { MessageView } from "../conversation.types.js";
import type { IConversationRepository } from "../repositories/conversation.repository.interface.js";
import { restrictedTo, type ConversationActor } from "./conversation-access.js";

interface Input {
	applicationId: string;
	conversationId: string;
	actor: ConversationActor;
	body: string;
	internal: boolean;
}

export class SendAgentMessageUseCase {
	constructor(private readonly deps: { conversationRepository: IConversationRepository }) {}

	async execute(input: Input): Promise<MessageView> {
		const result = await this.deps.conversationRepository.appendMessage(input.applicationId, input.conversationId, {
			kind: input.internal ? "agent-note" : "agent-reply",
			senderUserId: input.actor.id,
			body: input.body,
			requireAssignee: restrictedTo(input.actor, "conversation.reply"),
		});
		if (result.result === "ok") return result.message;
		if (result.result === "invalid") throw new ConflictError(result.reason);
		throw new NotFoundError("Conversation not found");
	}
}
