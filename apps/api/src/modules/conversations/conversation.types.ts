import type { Page } from "../../foundation/utils/cursor.js";
import type { ConversationStatus } from "./domain/conversation-state.js";

export interface ConversationView {
	id: string;
	applicationId: string;
	subject: string | null;
	status: ConversationStatus;
	assigneeUserId: string | null;
	assignee: { id: string; email: string; displayName: string | null } | null;
	customer: { id: string; externalId: string | null; displayName: string | null; email: string | null };
	lastMessageAt: Date;
	resolvedAt: Date | null;
	closedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export type MessageSenderKind = "CUSTOMER" | "AI" | "AGENT" | "SYSTEM";

export interface MessageView {
	id: string;
	conversationId: string;
	sender: MessageSenderKind;
	senderUserId: string | null;
	body: string;
	internal: boolean;
	metadata: Record<string, string | number | boolean | null> | null;
	createdAt: Date;
}

export interface ConversationFilters {
	status?: ConversationStatus[];
	assignee?: { kind: "user"; userId: string } | { kind: "unassigned" };
	customerId?: string;
	restrictToAssignee?: string;
}

export interface ConversationListQuery {
	filters: ConversationFilters;
	limit: number;
	cursor?: string;
}

export type TransitionResult =
	| { result: "ok"; conversation: ConversationView; changed: boolean; event: string | null }
	| { result: "not-found" }
	| { result: "not-assignee" }
	| { result: "invalid"; reason: string };

export type AppendResult =
	| { result: "ok"; message: MessageView; reopened: boolean; state?: { status: ConversationStatus; assigneeUserId: string | null } }
	| { result: "not-found" }
	| { result: "not-assignee" }
	| { result: "invalid"; reason: string };

export interface TransitionContext {
	actorId?: string;
	requireAssignee?: string;
	note?: string;
}

export interface AppendInput {
	kind: "customer" | "agent-reply" | "agent-note" | "ai";
	senderUserId?: string;
	body: string;
	metadata?: Record<string, string | number | boolean | null>;
	requireAssignee?: string;
}

export type ConversationPage = Page<ConversationView>;
export type MessagePage = Page<MessageView>;
