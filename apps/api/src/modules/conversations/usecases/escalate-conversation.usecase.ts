import type { ConversationView } from "../conversation.types.js";
import type { IConversationRepository } from "../repositories/conversation.repository.interface.js";
import { unwrapTransition } from "./conversation-access.js";

export class EscalateConversationUseCase {
	constructor(private readonly deps: { conversationRepository: IConversationRepository }) {}

	async execute(input: { applicationId: string; conversationId: string }): Promise<ConversationView> {
		const result = await this.deps.conversationRepository.apply(input.applicationId, input.conversationId, { type: "escalate" });
		return unwrapTransition(result).conversation;
	}
}
