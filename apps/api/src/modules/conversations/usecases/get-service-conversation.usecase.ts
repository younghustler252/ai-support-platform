import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { ConversationView } from "../conversation.types.js";
import type { IConversationRepository } from "../repositories/conversation.repository.interface.js";

export interface PublicConversation {
	id: string;
	status: ConversationView["status"];
	subject: string | null;
	customerExternalId: string | null;
	createdAt: Date;
	lastMessageAt: Date;
}

export function toPublicConversation(conversation: ConversationView): PublicConversation {
	return {
		id: conversation.id,
		status: conversation.status,
		subject: conversation.subject,
		customerExternalId: conversation.customer.externalId,
		createdAt: conversation.createdAt,
		lastMessageAt: conversation.lastMessageAt,
	};
}

export class GetServiceConversationUseCase {
	constructor(private readonly deps: { conversationRepository: IConversationRepository }) {}

	async execute(input: { applicationId: string; conversationId: string }): Promise<PublicConversation> {
		const conversation = await this.deps.conversationRepository.find(input.applicationId, input.conversationId);
		if (!conversation) throw new NotFoundError("Conversation not found");
		return toPublicConversation(conversation);
	}
}
