import type { ConversationStatus } from "../conversations/domain/conversation-state.js";

export const applicationChannel = (applicationId: string): string => `app:${applicationId}`;
export const conversationChannel = (conversationId: string): string => `conversation:${conversationId}`;

export interface AgentMessageEvent {
	type: "message.created";
	conversationId: string;
	messageId: string;
	sender: "CUSTOMER" | "AI" | "AGENT" | "SYSTEM";
	internal: boolean;
	assigneeUserId: string | null;
}

export interface AgentConversationEvent {
	type: "conversation.updated";
	conversationId: string;
	status: ConversationStatus;
	assigneeUserId: string | null;
	event: string | null;
}

export type AgentEvent = AgentMessageEvent | AgentConversationEvent;

export type CustomerEvent =
	| { type: "message.created"; conversationId: string; messageId: string }
	| { type: "conversation.updated"; conversationId: string; status: ConversationStatus };
