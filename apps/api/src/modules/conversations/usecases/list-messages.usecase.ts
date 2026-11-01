import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { MessagePage } from "../conversation.types.js";
import type { IConversationRepository } from "../repositories/conversation.repository.interface.js";
import { assertVisible, restrictedTo, type ConversationActor } from "./conversation-access.js";

export class ListMessagesUseCase {
	constructor(private readonly deps: { conversationRepository: IConversationRepository }) {}

	async execute(input: {
		applicationId: string;
		conversationId: string;
		actor: ConversationActor;
		limit: number;
		cursor?: string;
	}): Promise<MessagePage> {
		const { conversationRepository } = this.deps;
		const conversation = await conversationRepository.find(input.applicationId, input.conversationId);
		if (!conversation) throw new NotFoundError("Conversation not found");
		assertVisible(conversation, restrictedTo(input.actor, "conversation.read"));

		const page = await conversationRepository.listMessages(input.applicationId, input.conversationId, {
			includeInternal: true,
			limit: input.limit,
			cursor: input.cursor,
		});
		if (!page) throw new NotFoundError("Conversation not found");
		return page;
	}
}
