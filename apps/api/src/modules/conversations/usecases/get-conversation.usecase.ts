import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { ConversationView } from "../conversation.types.js";
import type { IConversationRepository } from "../repositories/conversation.repository.interface.js";
import { assertVisible, restrictedTo, type ConversationActor } from "./conversation-access.js";

export class GetConversationUseCase {
	constructor(private readonly deps: { conversationRepository: IConversationRepository }) {}

	async execute(input: { applicationId: string; conversationId: string; actor: ConversationActor }): Promise<ConversationView> {
		const conversation = await this.deps.conversationRepository.find(input.applicationId, input.conversationId);
		if (!conversation) throw new NotFoundError("Conversation not found");
		assertVisible(conversation, restrictedTo(input.actor, "conversation.read"));
		return conversation;
	}
}
