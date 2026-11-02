import assert from "node:assert/strict";
import { test } from "node:test";

import {
	canPost,
	decide,
	type ConversationCommand,
	type ConversationState,
	type ConversationStatus,
} from "../src/modules/conversations/domain/conversation-state.js";

const state = (status: ConversationStatus, assigneeUserId: string | null = null): ConversationState => ({ status, assigneeUserId });

function run(current: ConversationState, command: ConversationCommand) {
	const decision = decide(current, command);
	assert.ok(decision.ok, decision.ok ? "" : decision.reason);
	return decision.outcome;
}

function refuses(current: ConversationState, command: ConversationCommand) {
	assert.equal(decide(current, command).ok, false, `${current.status} should refuse ${command.type}`);
}

test("claiming takes an unassigned open conversation and refuses an assigned or finished one", () => {
	for (const status of ["AI_ACTIVE", "WAITING_FOR_AGENT"] as const) {
		const outcome = run(state(status), { type: "claim", agentId: "a1" });
		assert.equal(outcome.status, "ASSIGNED_TO_AGENT");
		assert.equal(outcome.assigneeUserId, "a1");
		assert.equal(outcome.startAssignmentFor, "a1");
		assert.equal(outcome.endAssignmentReason, null);
		assert.equal(outcome.event, "claimed");
	}
	refuses(state("ASSIGNED_TO_AGENT", "a2"), { type: "claim", agentId: "a1" });
	refuses(state("RESOLVED"), { type: "claim", agentId: "a1" });
	refuses(state("CLOSED"), { type: "claim", agentId: "a1" });
});

test("assigning replaces the current agent and is a no-op for the same agent", () => {
	const reassigned = run(state("ASSIGNED_TO_AGENT", "a1"), { type: "assign", agentId: "a2" });
	assert.equal(reassigned.assigneeUserId, "a2");
	assert.equal(reassigned.endAssignmentReason, "REASSIGNED");
	assert.equal(reassigned.startAssignmentFor, "a2");
	assert.equal(reassigned.event, "reassigned");

	assert.equal(run(state("WAITING_FOR_AGENT"), { type: "assign", agentId: "a2" }).event, "assigned");
	assert.equal(run(state("ASSIGNED_TO_AGENT", "a1"), { type: "assign", agentId: "a1" }).changed, false);
	refuses(state("RESOLVED"), { type: "assign", agentId: "a1" });
	refuses(state("CLOSED"), { type: "assign", agentId: "a1" });
});

test("transferring needs an assigned conversation and a different agent", () => {
	const outcome = run(state("ASSIGNED_TO_AGENT", "a1"), { type: "transfer", agentId: "a2" });
	assert.equal(outcome.assigneeUserId, "a2");
	assert.equal(outcome.endAssignmentReason, "TRANSFERRED");
	assert.equal(outcome.event, "transferred");
	refuses(state("ASSIGNED_TO_AGENT", "a1"), { type: "transfer", agentId: "a1" });
	refuses(state("WAITING_FOR_AGENT"), { type: "transfer", agentId: "a2" });
	refuses(state("AI_ACTIVE"), { type: "transfer", agentId: "a2" });
});

test("releasing returns the conversation to the queue", () => {
	const outcome = run(state("ASSIGNED_TO_AGENT", "a1"), { type: "release" });
	assert.equal(outcome.status, "WAITING_FOR_AGENT");
	assert.equal(outcome.assigneeUserId, null);
	assert.equal(outcome.endAssignmentReason, "RELEASED");
	refuses(state("WAITING_FOR_AGENT"), { type: "release" });
});

test("resolving ends the assignment, is idempotent and cannot revive a closed conversation", () => {
	const outcome = run(state("ASSIGNED_TO_AGENT", "a1"), { type: "resolve" });
	assert.equal(outcome.status, "RESOLVED");
	assert.equal(outcome.assigneeUserId, null);
	assert.equal(outcome.endAssignmentReason, "RESOLVED");

	assert.equal(run(state("AI_ACTIVE"), { type: "resolve" }).endAssignmentReason, null);
	assert.equal(run(state("RESOLVED"), { type: "resolve" }).changed, false);
	refuses(state("CLOSED"), { type: "resolve" });
});

test("only resolved conversations can be reopened and they go back to the queue", () => {
	const outcome = run(state("RESOLVED"), { type: "reopen" });
	assert.equal(outcome.status, "WAITING_FOR_AGENT");
	assert.equal(outcome.assigneeUserId, null);
	for (const status of ["AI_ACTIVE", "WAITING_FOR_AGENT", "ASSIGNED_TO_AGENT", "CLOSED"] as const) {
		refuses(state(status, status === "ASSIGNED_TO_AGENT" ? "a1" : null), { type: "reopen" });
	}
});

test("closing is final and ends any assignment", () => {
	const outcome = run(state("ASSIGNED_TO_AGENT", "a1"), { type: "close" });
	assert.equal(outcome.status, "CLOSED");
	assert.equal(outcome.endAssignmentReason, "CLOSED");
	assert.equal(run(state("CLOSED"), { type: "close" }).changed, false);
	for (const command of [{ type: "claim", agentId: "a" }, { type: "reopen" }, { type: "escalate" }, { type: "customer-message" }] as ConversationCommand[]) {
		refuses(state("CLOSED"), command);
	}
});

test("a customer asking for a human escalates AI conversations and reopens resolved ones", () => {
	assert.equal(run(state("AI_ACTIVE"), { type: "escalate" }).status, "WAITING_FOR_AGENT");
	assert.equal(run(state("WAITING_FOR_AGENT"), { type: "escalate" }).changed, false);
	assert.equal(run(state("ASSIGNED_TO_AGENT", "a1"), { type: "escalate" }).changed, false);
	assert.equal(run(state("RESOLVED"), { type: "escalate" }).event, "reopened_by_customer");
});

test("a customer message only changes a resolved conversation", () => {
	for (const status of ["AI_ACTIVE", "WAITING_FOR_AGENT", "ASSIGNED_TO_AGENT"] as const) {
		assert.equal(run(state(status, status === "ASSIGNED_TO_AGENT" ? "a1" : null), { type: "customer-message" }).changed, false);
	}
	const reopened = run(state("RESOLVED"), { type: "customer-message" });
	assert.equal(reopened.status, "WAITING_FOR_AGENT");
	assert.equal(reopened.event, "reopened_by_customer");
});

test("agents reply only to assigned conversations and may leave notes until closure", () => {
	assert.equal(canPost(state("ASSIGNED_TO_AGENT", "a1"), "agent-reply").ok, true);
	for (const status of ["AI_ACTIVE", "WAITING_FOR_AGENT", "RESOLVED", "CLOSED"] as const) {
		assert.equal(canPost(state(status), "agent-reply").ok, false, status);
	}
	for (const status of ["AI_ACTIVE", "WAITING_FOR_AGENT", "ASSIGNED_TO_AGENT", "RESOLVED"] as const) {
		assert.equal(canPost(state(status), "agent-note").ok, true, status);
	}
	assert.equal(canPost(state("CLOSED"), "agent-note").ok, false);
	assert.equal(canPost(state("CLOSED"), "customer").ok, false);
	assert.equal(canPost(state("RESOLVED"), "customer").ok, true);
});

test("AI may only post while the conversation is handled by AI", () => {
	assert.equal(canPost(state("AI_ACTIVE"), "ai").ok, true);
	for (const status of ["WAITING_FOR_AGENT", "ASSIGNED_TO_AGENT", "RESOLVED", "CLOSED"] as const) {
		assert.equal(canPost(state(status), "ai").ok, false, status);
	}
});
