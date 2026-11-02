import type { PrismaClient } from "../../../generated/prisma/client.js";
import { decodeCursor, toPage } from "../../../foundation/utils/cursor.js";
import { canPost, decide, type ConversationCommand, type ConversationState, type ConversationStatus, type TransitionOutcome } from "../domain/conversation-state.js";
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
import type { IConversationRepository } from "./conversation.repository.interface.js";

const conversationSelect = {
	id: true,
	applicationId: true,
	subject: true,
	status: true,
	assigneeUserId: true,
	lastMessageAt: true,
	resolvedAt: true,
	closedAt: true,
	createdAt: true,
	updatedAt: true,
	customer: { select: { id: true, externalId: true, displayName: true, email: true } },
} as const;

const messageSelect = {
	id: true,
	conversationId: true,
	sender: true,
	senderUserId: true,
	body: true,
	internal: true,
	metadata: true,
	createdAt: true,
} as const;

interface ConversationRow {
	id: string;
	applicationId: string;
	subject: string | null;
	status: ConversationStatus;
	assigneeUserId: string | null;
	lastMessageAt: Date;
	resolvedAt: Date | null;
	closedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	customer: { id: string; externalId: string | null; displayName: string | null; email: string | null };
}

interface MessageRow {
	id: string;
	conversationId: string;
	sender: MessageView["sender"];
	senderUserId: string | null;
	body: string;
	internal: boolean;
	metadata: unknown;
	createdAt: Date;
}

interface LockedConversation {
	state: ConversationState;
	createMessage(data: {
		sender: MessageView["sender"];
		senderUserId: string | null;
		body: string;
		internal: boolean;
		metadata?: NonNullable<MessageView["metadata"]>;
	}): Promise<MessageRow>;
	touchLastMessage(at: Date): Promise<void>;
	persist(before: ConversationState, outcome: TransitionOutcome, context: TransitionContext): Promise<void>;
}

function toMessage(row: MessageRow): MessageView {
	return { ...row, metadata: (row.metadata as MessageView["metadata"]) ?? null };
}

const eventText = (event: string): string => `Conversation ${event.replace(/_/g, " ")}`;

export class ConversationRepositoryImpl implements IConversationRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	async list(applicationId: string, query: ConversationListQuery): Promise<ConversationPage> {
		const { filters } = query;
		const cursor = decodeCursor(query.cursor);
		const conditions = [
			...(filters.status && filters.status.length > 0 ? [{ status: { in: filters.status } }] : []),
			...(filters.assignee?.kind === "user" ? [{ assigneeUserId: filters.assignee.userId }] : []),
			...(filters.assignee?.kind === "unassigned" ? [{ assigneeUserId: null }] : []),
			...(filters.customerId ? [{ customerId: filters.customerId }] : []),
			...(filters.restrictToAssignee ? [{ assigneeUserId: filters.restrictToAssignee }] : []),
			...(cursor
				? [{ OR: [{ lastMessageAt: { lt: cursor.at } }, { lastMessageAt: cursor.at, id: { lt: cursor.id } }] }]
				: []),
		];
		const rows = await this.deps.prisma.conversation.findMany({
			where: { applicationId, ...(conditions.length > 0 ? { AND: conditions } : {}) },
			select: conversationSelect,
			orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
			take: query.limit + 1,
		});
		const views = await this.withAssignees(rows);
		return toPage(views, query.limit, (row) => ({ at: row.lastMessageAt, id: row.id }));
	}

	async find(applicationId: string, conversationId: string): Promise<ConversationView | null> {
		const row = await this.deps.prisma.conversation.findFirst({
			where: { id: conversationId, applicationId },
			select: conversationSelect,
		});
		return row ? (await this.withAssignees([row]))[0] ?? null : null;
	}

	countOpenForCustomer(applicationId: string, customerId: string): Promise<number> {
		return this.deps.prisma.conversation.count({
			where: { applicationId, customerId, status: { in: ["AI_ACTIVE", "WAITING_FOR_AGENT", "ASSIGNED_TO_AGENT"] } },
		});
	}

	async createWithMessage(
		applicationId: string,
		input: { customerId: string; subject: string | null; body: string },
	): Promise<{ conversation: ConversationView; message: MessageView }> {
		const created = await this.deps.prisma.$transaction(async (tx) => {
			const conversation = await tx.conversation.create({
				data: { applicationId, customerId: input.customerId, subject: input.subject },
				select: conversationSelect,
			});
			const message = await tx.message.create({
				data: { conversationId: conversation.id, sender: "CUSTOMER", body: input.body },
				select: messageSelect,
			});
			return { conversation, message };
		});
		const [conversation] = await this.withAssignees([created.conversation]);
		return { conversation: conversation as ConversationView, message: toMessage(created.message) };
	}

	async listMessages(
		applicationId: string,
		conversationId: string,
		query: { includeInternal: boolean; limit: number; cursor?: string },
	): Promise<MessagePage | null> {
		const exists = await this.deps.prisma.conversation.findFirst({
			where: { id: conversationId, applicationId },
			select: { id: true },
		});
		if (!exists) return null;

		const cursor = decodeCursor(query.cursor);
		const rows = await this.deps.prisma.message.findMany({
			where: {
				conversationId,
				...(query.includeInternal ? {} : { internal: false }),
				...(cursor ? { OR: [{ createdAt: { gt: cursor.at } }, { createdAt: cursor.at, id: { gt: cursor.id } }] } : {}),
			},
			select: messageSelect,
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			take: query.limit + 1,
		});
		return toPage(rows.map(toMessage), query.limit, (row) => ({ at: row.createdAt, id: row.id }));
	}

	async appendMessage(applicationId: string, conversationId: string, input: AppendInput): Promise<AppendResult> {
		return this.locked(applicationId, conversationId, async (locked): Promise<AppendResult> => {
			const { state } = locked;
			if (input.requireAssignee && state.assigneeUserId !== input.requireAssignee) return { result: "not-assignee" };

			let reopened = false;
			let current: ConversationState = state;
			if (input.kind === "customer") {
				const decision = decide(state, { type: "customer-message" });
				if (!decision.ok) return { result: "invalid", reason: decision.reason };
				if (decision.outcome.changed) {
					await locked.persist(state, decision.outcome, {});
					current = { status: decision.outcome.status, assigneeUserId: decision.outcome.assigneeUserId };
					reopened = true;
				}
			}

			const allowed = canPost(current, input.kind);
			if (!allowed.ok) return { result: "invalid", reason: allowed.reason };

			const internal = input.kind === "agent-note";
			const message = await locked.createMessage({
				sender: input.kind === "customer" ? "CUSTOMER" : input.kind === "ai" ? "AI" : "AGENT",
				senderUserId: input.senderUserId ?? null,
				body: input.body,
				internal,
				...(input.metadata ? { metadata: input.metadata } : {}),
			});
			if (!internal) await locked.touchLastMessage(message.createdAt);
			return { result: "ok", message: toMessage(message), reopened };
		});
	}

	async apply(
		applicationId: string,
		conversationId: string,
		command: ConversationCommand,
		context: TransitionContext = {},
	): Promise<TransitionResult> {
		const outcome = await this.locked(applicationId, conversationId, async (locked) => {
			const { state } = locked;
			if (context.requireAssignee && state.assigneeUserId !== context.requireAssignee) return { result: "not-assignee" as const };

			const decision = decide(state, command);
			if (!decision.ok) return { result: "invalid" as const, reason: decision.reason };
			if (decision.outcome.changed) await locked.persist(state, decision.outcome, context);
			return { result: "ok" as const, changed: decision.outcome.changed, event: decision.outcome.event };
		});
		if (outcome.result !== "ok") return outcome;

		const conversation = await this.find(applicationId, conversationId);
		if (!conversation) return { result: "not-found" };
		return { result: "ok", conversation, changed: outcome.changed, event: outcome.event };
	}

	async recentMessages(applicationId: string, conversationId: string, limit: number): Promise<MessageView[] | null> {
		const exists = await this.deps.prisma.conversation.findFirst({ where: { id: conversationId, applicationId }, select: { id: true } });
		if (!exists) return null;
		const rows = await this.deps.prisma.message.findMany({
			where: { conversationId, internal: false },
			select: messageSelect,
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: limit,
		});
		return rows.reverse().map(toMessage);
	}

	private locked<R>(
		applicationId: string,
		conversationId: string,
		work: (locked: LockedConversation) => Promise<R>,
	): Promise<R | { result: "not-found" }> {
		return this.deps.prisma.$transaction(async (tx) => {
			const rows = await tx.$queryRaw<Array<{ status: ConversationStatus; assigneeUserId: string | null }>>`
				SELECT "status", "assigneeUserId" FROM "Conversation"
				WHERE "id" = ${conversationId} AND "applicationId" = ${applicationId}
				FOR UPDATE
			`;
			const row = rows[0];
			if (!row) return { result: "not-found" as const };

			const locked: LockedConversation = {
				state: { status: row.status, assigneeUserId: row.assigneeUserId },
				createMessage: (data) => tx.message.create({ data: { conversationId, ...data }, select: messageSelect }),
				touchLastMessage: async (at) => {
					await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: at } });
				},
				persist: async (before, outcome, context) => {
					const now = new Date();
					await tx.conversation.update({
						where: { id: conversationId },
						data: {
							status: outcome.status,
							assigneeUserId: outcome.assigneeUserId,
							...(outcome.status === "RESOLVED" ? { resolvedAt: now } : {}),
							...(outcome.status === "CLOSED" ? { closedAt: now } : {}),
							...(before.status === "RESOLVED" && outcome.status !== "RESOLVED" && outcome.status !== "CLOSED"
								? { resolvedAt: null }
								: {}),
							...(outcome.status === "WAITING_FOR_AGENT" || outcome.status === "ASSIGNED_TO_AGENT" ? { lastMessageAt: now } : {}),
						},
					});

					if (outcome.endAssignmentReason) {
						await tx.conversationAssignment.updateMany({
							where: { conversationId, endedAt: null },
							data: { endedAt: now, endReason: outcome.endAssignmentReason },
						});
					}
					if (outcome.startAssignmentFor) {
						await tx.conversationAssignment.create({
							data: { conversationId, agentUserId: outcome.startAssignmentFor, assignedByUserId: context.actorId ?? null },
						});
					}
					if (outcome.event) {
						await tx.message.create({
							data: {
								conversationId,
								sender: "SYSTEM",
								body: eventText(outcome.event),
								internal: true,
								metadata: {
									event: outcome.event,
									...(context.actorId ? { actorUserId: context.actorId } : {}),
									...(outcome.startAssignmentFor ? { agentUserId: outcome.startAssignmentFor } : {}),
									...(context.note ? { note: context.note } : {}),
								},
							},
						});
					}
				},
			};
			return work(locked);
		});
	}

	private async withAssignees(rows: ConversationRow[]): Promise<ConversationView[]> {
		const ids = [...new Set(rows.map((row) => row.assigneeUserId).filter((id): id is string => id !== null))];
		const users =
			ids.length > 0
				? await this.deps.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, displayName: true } })
				: [];
		const byId = new Map<string, { id: string; email: string; displayName: string | null }>(
			users.map((user: { id: string; email: string; displayName: string | null }) => [user.id, user]),
		);
		return rows.map((row) => ({ ...row, assignee: row.assigneeUserId ? (byId.get(row.assigneeUserId) ?? null) : null }));
	}
}
