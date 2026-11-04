import type { IWebhookDispatcher } from "../../webhooks/webhook-dispatcher.js";
import type { RealtimePublisher } from "../../realtime/realtime-publisher.js";
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
import type { ConversationCommand } from "../domain/conversation-state.js";
import type { IConversationRepository } from "./conversation.repository.interface.js";

export class EventPublishingConversationRepository implements IConversationRepository {
	constructor(private readonly deps: {
		conversationRepositoryImpl: IConversationRepository;
		realtimePublisher: RealtimePublisher;
		webhookDispatcher: IWebhookDispatcher;
	}) {}

	private get inner(): IConversationRepository {
		return this.deps.conversationRepositoryImpl;
	}

	list(applicationId: string, query: ConversationListQuery): Promise<ConversationPage> {
		return this.inner.list(applicationId, query);
	}

	find(applicationId: string, conversationId: string): Promise<ConversationView | null> {
		return this.inner.find(applicationId, conversationId);
	}

	countOpenForCustomer(applicationId: string, customerId: string): Promise<number> {
		return this.inner.countOpenForCustomer(applicationId, customerId);
	}

	listMessages(
		applicationId: string,
		conversationId: string,
		query: { includeInternal: boolean; limit: number; cursor?: string },
	): Promise<MessagePage | null> {
		return this.inner.listMessages(applicationId, conversationId, query);
	}

	recentMessages(applicationId: string, conversationId: string, limit: number): Promise<MessageView[] | null> {
		return this.inner.recentMessages(applicationId, conversationId, limit);
	}

	async createWithMessage(
		applicationId: string,
		input: { customerId: string; subject: string | null; body: string },
	): Promise<{ conversation: ConversationView; message: MessageView }> {
		const created = await this.inner.createWithMessage(applicationId, input);
		const { realtimePublisher, webhookDispatcher } = this.deps;
		await realtimePublisher.conversation({ applicationId, conversation: created.conversation, event: "created" });
		await realtimePublisher.message({ applicationId, message: created.message, assigneeUserId: null });
		await webhookDispatcher.conversationEvent(applicationId, created.conversation, "created");
		await webhookDispatcher.messageEvent(applicationId, created.message);
		return created;
	}

	async appendMessage(applicationId: string, conversationId: string, input: AppendInput): Promise<AppendResult> {
		const result = await this.inner.appendMessage(applicationId, conversationId, input);
		if (result.result !== "ok") return result;
		const { realtimePublisher, webhookDispatcher } = this.deps;
		if (result.reopened) {
			const conversation = await this.inner.find(applicationId, conversationId);
			if (conversation) {
				await realtimePublisher.conversation({ applicationId, conversation, event: "reopened_by_customer" });
				await webhookDispatcher.conversationEvent(applicationId, conversation, "reopened_by_customer");
			}
		}
		await realtimePublisher.message({ applicationId, message: result.message, assigneeUserId: result.state?.assigneeUserId ?? null });
		await webhookDispatcher.messageEvent(applicationId, result.message);
		return result;
	}

	async apply(
		applicationId: string,
		conversationId: string,
		command: ConversationCommand,
		context?: TransitionContext,
	): Promise<TransitionResult> {
		const result = await this.inner.apply(applicationId, conversationId, command, context);
		if (result.result === "ok" && result.changed) {
			await this.deps.realtimePublisher.conversation({ applicationId, conversation: result.conversation, event: result.event });
			await this.deps.webhookDispatcher.conversationEvent(applicationId, result.conversation, result.event);
		}
		return result;
	}
}
