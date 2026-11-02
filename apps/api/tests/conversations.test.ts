import assert from "node:assert/strict";
import { test } from "node:test";

import { tenancyConfig } from "../src/config/tenancy.js";
import { ConflictError, ForbiddenError, LimitExceededError, NotFoundError, ValidationError } from "../src/foundation/errors/app-error.js";
import { decodeCursor, encodeCursor, toPage } from "../src/foundation/utils/cursor.js";
import type { ICustomerRepository } from "../src/modules/customers/repositories/customer.repository.interface.js";
import type {
	AppendResult,
	ConversationFilters,
	ConversationView,
	MessageView,
	TransitionResult,
} from "../src/modules/conversations/conversation.types.js";
import type { ConversationCommand } from "../src/modules/conversations/domain/conversation-state.js";
import type { IConversationRepository } from "../src/modules/conversations/repositories/conversation.repository.interface.js";
import { AssignConversationUseCase } from "../src/modules/conversations/usecases/assign-conversation.usecase.js";
import { ClaimConversationUseCase } from "../src/modules/conversations/usecases/claim-conversation.usecase.js";
import { GetConversationUseCase } from "../src/modules/conversations/usecases/get-conversation.usecase.js";
import { toPublicConversation } from "../src/modules/conversations/usecases/get-service-conversation.usecase.js";
import { ListConversationsUseCase } from "../src/modules/conversations/usecases/list-conversations.usecase.js";
import { ListMessagesUseCase } from "../src/modules/conversations/usecases/list-messages.usecase.js";
import { ResolveConversationUseCase } from "../src/modules/conversations/usecases/resolve-conversation.usecase.js";
import { SendAgentMessageUseCase } from "../src/modules/conversations/usecases/send-agent-message.usecase.js";
import { SendCustomerMessageUseCase } from "../src/modules/conversations/usecases/send-customer-message.usecase.js";
import { StartConversationUseCase } from "../src/modules/conversations/usecases/start-conversation.usecase.js";
import { TransferConversationUseCase } from "../src/modules/conversations/usecases/transfer-conversation.usecase.js";
import {
	listConversationsQuerySchema,
	sendMessageSchema,
	startConversationSchema,
} from "../src/modules/conversations/validators/conversation.validator.js";
import { externalIdSchema, updateCustomerSchema } from "../src/modules/customers/validators/customer.validator.js";
import type { EffectiveGrants } from "../src/modules/tenancy/tenancy.types.js";
import type { Authorizer } from "../src/modules/tenancy/services/authorizer.service.js";
import { applicationGrants } from "../src/modules/tenancy/services/effective-grants.js";
import { auditSpy } from "./helpers.js";

const agentGrants = applicationGrants({ organizationRole: "MEMBER", organizationCustom: [], applicationRole: "MEMBER", applicationCustom: [] });
const restrictedGrants: EffectiveGrants = { "conversation.read": "ASSIGNED", "conversation.reply": "ASSIGNED" };
const agent = { id: "agent-1", grants: agentGrants };

function conversation(overrides: Partial<ConversationView> = {}): ConversationView {
	return {
		id: "conv-1",
		applicationId: "app-1",
		subject: null,
		status: "WAITING_FOR_AGENT",
		assigneeUserId: null,
		assignee: null,
		customer: { id: "cust-1", externalId: "ext-1", displayName: null, email: null },
		lastMessageAt: new Date(),
		resolvedAt: null,
		closedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

function message(overrides: Partial<MessageView> = {}): MessageView {
	return { id: "msg-1", conversationId: "conv-1", sender: "AGENT", senderUserId: "agent-1", body: "hi", internal: false, metadata: null, createdAt: new Date(), ...overrides };
}

function repository(overrides: Partial<IConversationRepository> = {}): IConversationRepository {
	return {
		list: async () => ({ items: [], nextCursor: null }),
		find: async () => conversation(),
		countOpenForCustomer: async () => 0,
		createWithMessage: async () => ({ conversation: conversation({ status: "AI_ACTIVE" }), message: message({ sender: "CUSTOMER" }) }),
		listMessages: async () => ({ items: [], nextCursor: null }),
		recentMessages: async () => [],
		appendMessage: async (): Promise<AppendResult> => ({ result: "ok", message: message(), reopened: false }),
		apply: async (): Promise<TransitionResult> => ({ result: "ok", conversation: conversation(), changed: true, event: "claimed" }),
		...overrides,
	};
}

const input = { organizationId: "org-1", applicationId: "app-1", conversationId: "conv-1", actor: agent };

test("cursors round trip and malformed ones are rejected", () => {
	const at = new Date("2026-01-02T03:04:05.678Z");
	const decoded = decodeCursor(encodeCursor(at, "abc"));
	assert.equal(decoded?.id, "abc");
	assert.equal(decoded?.at.getTime(), at.getTime());
	assert.equal(decodeCursor(undefined), null);
	for (const bad of ["!!!", Buffer.from("{}").toString("base64url"), Buffer.from('{"t":"nope","i":"x"}').toString("base64url")]) {
		assert.throws(() => decodeCursor(bad), ValidationError);
	}
});

test("pages return one extra row as the next cursor marker", () => {
	const rows = [1, 2, 3].map((n) => ({ id: String(n), at: new Date(n * 1000) }));
	const page = toPage(rows, 2, (row) => row);
	assert.equal(page.items.length, 2);
	assert.ok(page.nextCursor);
	assert.equal(toPage(rows.slice(0, 2), 2, (row) => row).nextCursor, null);
});

test("listing conversations resolves the assignee shortcut and applies the assigned-only restriction", async () => {
	const seen: ConversationFilters[] = [];
	const useCase = new ListConversationsUseCase({
		conversationRepository: repository({ list: async (_app, query) => { seen.push(query.filters); return { items: [], nextCursor: null }; } }),
	});
	await useCase.execute({ applicationId: "app-1", actor: agent, assignee: "me", limit: 25 });
	await useCase.execute({ applicationId: "app-1", actor: agent, assignee: "unassigned", status: ["WAITING_FOR_AGENT"], limit: 25 });
	await useCase.execute({ applicationId: "app-1", actor: { id: "agent-2", grants: restrictedGrants }, limit: 25 });

	assert.deepEqual(seen[0]?.assignee, { kind: "user", userId: "agent-1" });
	assert.equal(seen[0]?.restrictToAssignee, undefined);
	assert.deepEqual(seen[1]?.assignee, { kind: "unassigned" });
	assert.deepEqual(seen[1]?.status, ["WAITING_FOR_AGENT"]);
	assert.equal(seen[2]?.restrictToAssignee, "agent-2");
});

test("assigned-only agents cannot see, read messages of or reply to other agents' conversations", async () => {
	const restricted = { id: "agent-2", grants: restrictedGrants };
	const repo = repository({ find: async () => conversation({ status: "ASSIGNED_TO_AGENT", assigneeUserId: "agent-1" }) });

	await assert.rejects(new GetConversationUseCase({ conversationRepository: repo }).execute({ applicationId: "app-1", conversationId: "conv-1", actor: restricted }), NotFoundError);
	await assert.rejects(new ListMessagesUseCase({ conversationRepository: repo }).execute({ applicationId: "app-1", conversationId: "conv-1", actor: restricted, limit: 10 }), NotFoundError);

	const own = repository({ find: async () => conversation({ status: "ASSIGNED_TO_AGENT", assigneeUserId: "agent-2" }) });
	assert.equal((await new GetConversationUseCase({ conversationRepository: own }).execute({ applicationId: "app-1", conversationId: "conv-1", actor: restricted })).id, "conv-1");
	assert.equal((await new GetConversationUseCase({ conversationRepository: repo }).execute({ applicationId: "app-1", conversationId: "conv-1", actor: agent })).id, "conv-1");

	let required: string | undefined;
	const sender = new SendAgentMessageUseCase({
		conversationRepository: repository({
			appendMessage: async (_a, _c, append) => { required = append.requireAssignee; return { result: "not-assignee" }; },
		}),
	});
	await assert.rejects(sender.execute({ applicationId: "app-1", conversationId: "conv-1", actor: restricted, body: "x", internal: false }), NotFoundError);
	assert.equal(required, "agent-2");
});

test("agent messages map repository outcomes and choose reply or note", async () => {
	const kinds: string[] = [];
	const useCase = (result: AppendResult) =>
		new SendAgentMessageUseCase({ conversationRepository: repository({ appendMessage: async (_a, _c, append) => { kinds.push(append.kind); return result; } }) });
	const base = { applicationId: "app-1", conversationId: "conv-1", actor: agent, body: "hello" };

	await useCase({ result: "ok", message: message(), reopened: false }).execute({ ...base, internal: false });
	await useCase({ result: "ok", message: message({ internal: true }), reopened: false }).execute({ ...base, internal: true });
	assert.deepEqual(kinds, ["agent-reply", "agent-note"]);

	await assert.rejects(useCase({ result: "invalid", reason: "Claim the conversation before replying" }).execute({ ...base, internal: false }), ConflictError);
	await assert.rejects(useCase({ result: "not-found" }).execute({ ...base, internal: false }), NotFoundError);
});

test("claiming and resolving audit real changes only and map failures", async () => {
	const audit = auditSpy();
	const claim = new ClaimConversationUseCase({ conversationRepository: repository(), auditService: audit });
	await claim.execute(input);
	assert.equal(audit.events[0]?.action, "conversation.claimed");
	assert.equal(audit.events[0]?.metadata?.applicationId, "app-1");

	const noop = new ResolveConversationUseCase({
		conversationRepository: repository({ apply: async () => ({ result: "ok", conversation: conversation(), changed: false, event: null }) }),
		auditService: audit,
	});
	await noop.execute(input);
	assert.equal(audit.events.length, 1);

	const conflict = new ClaimConversationUseCase({ conversationRepository: repository({ apply: async () => ({ result: "invalid", reason: "The conversation is already assigned" }) }), auditService: audit });
	await assert.rejects(conflict.execute(input), ConflictError);
	const missing = new ClaimConversationUseCase({ conversationRepository: repository({ apply: async () => ({ result: "not-found" }) }), auditService: audit });
	await assert.rejects(missing.execute(input), NotFoundError);
});

test("resolving by an assigned-only agent is limited to their own conversations", async () => {
	const contexts: Array<{ requireAssignee?: string }> = [];
	const useCase = new ResolveConversationUseCase({
		conversationRepository: repository({
			apply: async (_a, _c, _cmd, context) => {
				contexts.push(context ?? {});
				return { result: "ok", conversation: conversation(), changed: true, event: "resolved" };
			},
		}),
		auditService: auditSpy(),
	});
	await useCase.execute(input);
	await useCase.execute({ ...input, actor: { id: "agent-9", grants: { "conversation.resolve": "ASSIGNED" } } });
	assert.equal(contexts[0]?.requireAssignee, undefined);
	assert.equal(contexts[1]?.requireAssignee, "agent-9");
});

function authorizerAllowing(allowed: Set<string>): Authorizer {
	return {
		organization: async () => { throw new Error("unused"); },
		application: async (userId: string, organizationId: string, applicationId: string) => {
			if (userId === "gone") throw new NotFoundError();
			if (userId === "viewer") throw new ForbiddenError();
			if (!allowed.has(userId)) throw new Error("boom");
			return { organizationId, applicationId, organizationRole: "MEMBER", role: "MEMBER", viaOrganization: false, grants: {} };
		},
	} as unknown as Authorizer;
}

test("assigning and transferring only target users who can handle conversations", async () => {
	const authorizer = authorizerAllowing(new Set(["agent-2"]));
	const audit = auditSpy();
	const calls: ConversationCommand[] = [];
	const repo = repository({ apply: async (_a, _c, command) => { calls.push(command); return { result: "ok", conversation: conversation(), changed: true, event: "transferred" }; } });

	const assign = new AssignConversationUseCase({ conversationRepository: repo, auditService: audit, authorizer });
	const transfer = new TransferConversationUseCase({ conversationRepository: repo, auditService: audit, authorizer });

	await assign.execute({ ...input, targetUserId: "agent-2" });
	await transfer.execute({ ...input, targetUserId: "agent-2", note: "needs billing" });
	assert.deepEqual(calls, [{ type: "assign", agentId: "agent-2" }, { type: "transfer", agentId: "agent-2" }]);
	assert.equal(audit.events[1]?.metadata?.targetUserId, "agent-2");

	for (const target of ["gone", "viewer"]) {
		await assert.rejects(assign.execute({ ...input, targetUserId: target }), ValidationError);
		await assert.rejects(transfer.execute({ ...input, targetUserId: target }), ValidationError);
	}
	await assert.rejects(assign.execute({ ...input, targetUserId: "unexpected" }), /boom/);
	assert.equal(calls.length, 2);
});

test("starting a conversation upserts the customer and enforces the open conversation limit", async () => {
	const upserts: string[] = [];
	const customers = {
		upsertByExternalId: async (_app: string, externalId: string) => { upserts.push(externalId); return { id: "cust-1", applicationId: "app-1", externalId, displayName: null, email: null, metadata: null, createdAt: new Date(), updatedAt: new Date() }; },
	} as unknown as ICustomerRepository;
	const started = await new StartConversationUseCase({ conversationRepository: repository(), customerRepository: customers }).execute({
		applicationId: "app-1",
		customer: { externalId: "user-42" },
		message: "help",
	});
	assert.deepEqual(upserts, ["user-42"]);
	assert.equal(started.conversation.status, "AI_ACTIVE");

	const full = new StartConversationUseCase({
		conversationRepository: repository({ countOpenForCustomer: async () => tenancyConfig.limits.openConversationsPerCustomer }),
		customerRepository: customers,
	});
	await assert.rejects(full.execute({ applicationId: "app-1", customer: { externalId: "user-42" }, message: "again" }), LimitExceededError);
});

test("customer messages reopen resolved conversations and are refused once closed", async () => {
	const ok = new SendCustomerMessageUseCase({ conversationRepository: repository({ appendMessage: async () => ({ result: "ok", message: message({ sender: "CUSTOMER" }), reopened: true }) }) });
	assert.equal((await ok.execute({ applicationId: "app-1", conversationId: "conv-1", body: "hello" })).reopened, true);

	const closed = new SendCustomerMessageUseCase({ conversationRepository: repository({ appendMessage: async () => ({ result: "invalid", reason: "The conversation is closed" }) }) });
	await assert.rejects(closed.execute({ applicationId: "app-1", conversationId: "conv-1", body: "hello" }), ConflictError);
	const missing = new SendCustomerMessageUseCase({ conversationRepository: repository({ appendMessage: async () => ({ result: "not-found" }) }) });
	await assert.rejects(missing.execute({ applicationId: "app-1", conversationId: "conv-1", body: "hello" }), NotFoundError);
});

test("the public conversation view hides agents and customer details", () => {
	const view = toPublicConversation(conversation({ assigneeUserId: "agent-1", assignee: { id: "agent-1", email: "a@x.com", displayName: "A" } }));
	assert.deepEqual(Object.keys(view).sort(), ["createdAt", "customerExternalId", "id", "lastMessageAt", "status", "subject"]);
});

test("validators bound bodies, filters and customer identifiers", () => {
	assert.equal(sendMessageSchema.parse({ body: "  hi  " }).body, "hi");
	assert.equal(sendMessageSchema.parse({ body: "hi" }).internal, false);
	assert.equal(sendMessageSchema.safeParse({ body: "" }).success, false);
	assert.equal(sendMessageSchema.safeParse({ body: "x".repeat(tenancyConfig.messageBodyMaxLength + 1) }).success, false);
	assert.equal(sendMessageSchema.safeParse({ body: "hi", sender: "AI" }).success, false);

	assert.deepEqual(listConversationsQuerySchema.parse({ status: "WAITING_FOR_AGENT, RESOLVED" }).status, ["WAITING_FOR_AGENT", "RESOLVED"]);
	assert.equal(listConversationsQuerySchema.parse({}).limit, 25);
	assert.equal(listConversationsQuerySchema.safeParse({ status: "BOGUS" }).success, false);
	assert.equal(listConversationsQuerySchema.safeParse({ assignee: "someone" }).success, false);
	assert.equal(listConversationsQuerySchema.safeParse({ limit: "500" }).success, false);
	assert.equal(listConversationsQuerySchema.parse({ assignee: "me" }).assignee, "me");

	assert.equal(startConversationSchema.safeParse({ customer: { externalId: "u1" }, message: "hello" }).success, true);
	assert.equal(startConversationSchema.safeParse({ customer: { externalId: "u1" } }).success, false);
	assert.equal(startConversationSchema.safeParse({ customer: { externalId: "u1", role: "admin" }, message: "hello" }).success, false);

	assert.equal(externalIdSchema.safeParse("user-42").success, true);
	assert.equal(externalIdSchema.safeParse("bad\nid").success, false);
	assert.equal(externalIdSchema.safeParse("x".repeat(129)).success, false);
	assert.equal(updateCustomerSchema.safeParse({}).success, false);
	assert.equal(updateCustomerSchema.safeParse({ email: "Person@Example.com" }).success, true);
	assert.equal(updateCustomerSchema.safeParse({ metadata: { plan: "pro", seats: 5, vip: true } }).success, true);
	assert.equal(updateCustomerSchema.safeParse({ metadata: { nested: { a: 1 } } }).success, false);
});
