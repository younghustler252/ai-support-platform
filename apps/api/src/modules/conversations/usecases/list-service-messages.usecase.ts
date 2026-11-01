import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { MessagePage } from "../conversation.types.js";
import type { IConversationRepository } from "../repositories/conversation.repository.interface.js";

export class ListServiceMessagesUseCase {
	constructor(private readonly deps: { conversationRepository: IConversationRepository }) {}

	async execute(input: { applicationId: string; conversationId: string; limit: number; cursor?: string }): Promise<MessagePage> {
		const page = await this.deps.conversationRepository.listMessages(input.applicationId, input.conversationId, {
			includeInternal: false,
			limit: input.limit,
			cursor: input.cursor,
		});
		if (!page) throw new NotFoundError("Conversation not found");
		return page;
	}
}
