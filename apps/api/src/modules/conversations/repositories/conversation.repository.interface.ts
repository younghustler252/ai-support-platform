import type { ConversationCommand } from "../domain/conversation-state.js";
import type {
	AppendInput,
	AppendResult,
	ConversationListQuery,
	ConversationPage,
	ConversationView,
	MessagePage,
	MessageView,
	TransitionContext,
	TransitionResult,
} from "../conversation.types.js";

export interface IConversationRepository {
	list(applicationId: string, query: ConversationListQuery): Promise<ConversationPage>;
	find(applicationId: string, conversationId: string): Promise<ConversationView | null>;
	countOpenForCustomer(applicationId: string, customerId: string): Promise<number>;
	createWithMessage(
		applicationId: string,
		input: { customerId: string; subject: string | null; body: string },
	): Promise<{ conversation: ConversationView; message: MessageView }>;
	listMessages(
		applicationId: string,
		conversationId: string,
		query: { includeInternal: boolean; limit: number; cursor?: string },
	): Promise<MessagePage | null>;
	recentMessages(applicationId: string, conversationId: string, limit: number): Promise<MessageView[] | null>;
	appendMessage(applicationId: string, conversationId: string, input: AppendInput): Promise<AppendResult>;
	apply(
		applicationId: string,
		conversationId: string,
		command: ConversationCommand,
		context?: TransitionContext,
	): Promise<TransitionResult>;
}
