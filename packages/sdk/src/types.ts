export type TenantRole = "OWNER" | "ADMIN" | "MEMBER";

export interface User {
	id: string;
	email: string;
	displayName: string | null;
	emailVerifiedAt: string | null;
}

export interface Organization {
	id: string;
	name: string;
	slug: string;
	createdAt: string;
}

export interface OrganizationWithRole extends Organization {
	role: TenantRole;
}

export interface Application {
	id: string;
	organizationId: string;
	name: string;
	slug: string;
	description: string | null;
	allowedOrigins: string[];
	createdAt: string;
	updatedAt: string;
}

export interface RegisterInput {
	email: string;
	password: string;
	displayName?: string;
}

export interface LoginInput {
	email: string;
	password: string;
}

export interface CreateApplicationInput {
	name: string;
	slug?: string;
	description?: string;
	allowedOrigins?: string[];
}

export interface UpdateApplicationInput {
	name?: string;
	description?: string | null;
	allowedOrigins?: string[];
}

export type ConversationStatus = "AI_ACTIVE" | "WAITING_FOR_AGENT" | "ASSIGNED_TO_AGENT" | "RESOLVED" | "CLOSED";

export type MessageSender = "CUSTOMER" | "AI" | "AGENT" | "SYSTEM";

export interface ConversationAssignee {
	id: string;
	email: string;
	displayName: string | null;
}

export interface ConversationCustomer {
	id: string;
	externalId: string | null;
	displayName: string | null;
	email: string | null;
}

export interface Conversation {
	id: string;
	applicationId: string;
	subject: string | null;
	status: ConversationStatus;
	assigneeUserId: string | null;
	assignee: ConversationAssignee | null;
	customer: ConversationCustomer;
	lastMessageAt: string | null;
	resolvedAt: string | null;
	closedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface Message {
	id: string;
	conversationId: string;
	sender: MessageSender;
	senderUserId: string | null;
	body: string;
	internal: boolean;
	metadata: Record<string, unknown> | null;
	createdAt: string;
}

export interface Page<T> {
	items: T[];
	nextCursor: string | null;
}

export interface ListConversationsQuery {
	status?: ConversationStatus[];
	assignee?: "me" | "unassigned" | string;
	customerId?: string;
	limit?: number;
	cursor?: string;
}

export type ConversationAction = "claim" | "release" | "resolve" | "reopen" | "close";

export interface AgentMessageEvent {
	type: "message.created";
	conversationId: string;
	messageId: string;
	sender: MessageSender;
	internal: boolean;
	assigneeUserId: string | null;
}

export interface AgentConversationEvent {
	type: "conversation.updated";
	conversationId: string;
	status: ConversationStatus;
	assigneeUserId: string | null;
	event: string;
}

export type AgentEvent = AgentMessageEvent | AgentConversationEvent;

export interface ApplicationMember {
	userId: string;
	email: string;
	displayName: string | null;
	role: TenantRole;
	addedAt: string;
}
