import { logger } from "../../foundation/logging/logger.js";
import type { RealtimeBus } from "../../infrastructure/realtime/realtime-bus.js";
import type { ConversationView, MessageView } from "../conversations/conversation.types.js";
import {
	applicationChannel,
	conversationChannel,
	type AgentConversationEvent,
	type AgentMessageEvent,
	type CustomerEvent,
} from "./realtime.types.js";

export class RealtimePublisher {
	constructor(private readonly deps: { realtimeBus: RealtimeBus }) {}

	async message(input: { applicationId: string; message: MessageView; assigneeUserId: string | null }): Promise<void> {
		const { message } = input;
		const agentEvent: AgentMessageEvent = {
			type: "message.created",
			conversationId: message.conversationId,
			messageId: message.id,
			sender: message.sender,
			internal: message.internal,
			assigneeUserId: input.assigneeUserId,
		};
		const customerEvent: CustomerEvent = { type: "message.created", conversationId: message.conversationId, messageId: message.id };
		await this.send(applicationChannel(input.applicationId), agentEvent);
		if (!message.internal && message.sender !== "SYSTEM") await this.send(conversationChannel(message.conversationId), customerEvent);
	}

	async conversation(input: { applicationId: string; conversation: ConversationView; event: string | null }): Promise<void> {
		const { conversation } = input;
		const agentEvent: AgentConversationEvent = {
			type: "conversation.updated",
			conversationId: conversation.id,
			status: conversation.status,
			assigneeUserId: conversation.assigneeUserId,
			event: input.event,
		};
		await this.send(applicationChannel(input.applicationId), agentEvent);
		await this.send(conversationChannel(conversation.id), {
			type: "conversation.updated",
			conversationId: conversation.id,
			status: conversation.status,
		} satisfies CustomerEvent);
	}

	private async send(channel: string, payload: unknown): Promise<void> {
		try {
			await this.deps.realtimeBus.publish(channel, payload);
		} catch (error) {
			logger.warn("realtime.publish_failed", { error });
		}
	}
}
