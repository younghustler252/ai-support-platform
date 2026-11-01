import type { ConversationStatus } from "../domain/conversation-state.js";
import type { ConversationFilters, ConversationPage } from "../conversation.types.js";
import type { IConversationRepository } from "../repositories/conversation.repository.interface.js";
import { restrictedTo, type ConversationActor } from "./conversation-access.js";

interface Input {
	applicationId: string;
	actor: ConversationActor;
	status?: ConversationStatus[];
	assignee?: string;
	customerId?: string;
	limit: number;
	cursor?: string;
}

export class ListConversationsUseCase {
	constructor(private readonly deps: { conversationRepository: IConversationRepository }) {}

	execute(input: Input): Promise<ConversationPage> {
		const filters: ConversationFilters = {
			status: input.status,
			customerId: input.customerId,
			restrictToAssignee: restrictedTo(input.actor, "conversation.read"),
		};
		if (input.assignee === "unassigned") filters.assignee = { kind: "unassigned" };
		else if (input.assignee === "me") filters.assignee = { kind: "user", userId: input.actor.id };
		else if (input.assignee) filters.assignee = { kind: "user", userId: input.assignee };

		return this.deps.conversationRepository.list(input.applicationId, { filters, limit: input.limit, cursor: input.cursor });
	}
}
