export type ConversationStatus = "AI_ACTIVE" | "WAITING_FOR_AGENT" | "ASSIGNED_TO_AGENT" | "RESOLVED" | "CLOSED";

export type ConversationCommand =
	| { type: "claim"; agentId: string }
	| { type: "assign"; agentId: string }
	| { type: "transfer"; agentId: string }
	| { type: "release" }
	| { type: "resolve" }
	| { type: "reopen" }
	| { type: "close" }
	| { type: "escalate" }
	| { type: "customer-message" };

export interface ConversationState {
	status: ConversationStatus;
	assigneeUserId: string | null;
}

export interface TransitionOutcome {
	status: ConversationStatus;
	assigneeUserId: string | null;
	changed: boolean;
	event: string | null;
	endAssignmentReason: string | null;
	startAssignmentFor: string | null;
}

export type Decision = { ok: true; outcome: TransitionOutcome } | { ok: false; reason: string };

const open: readonly ConversationStatus[] = ["AI_ACTIVE", "WAITING_FOR_AGENT", "ASSIGNED_TO_AGENT"];

export function isOpen(status: ConversationStatus): boolean {
	return open.includes(status);
}

function unchanged(state: ConversationState): Decision {
	return {
		ok: true,
		outcome: {
			status: state.status,
			assigneeUserId: state.assigneeUserId,
			changed: false,
			event: null,
			endAssignmentReason: null,
			startAssignmentFor: null,
		},
	};
}

function change(
	state: ConversationState,
	next: { status: ConversationStatus; assigneeUserId: string | null; event: string; startFor?: string; endReason?: string },
): Decision {
	return {
		ok: true,
		outcome: {
			status: next.status,
			assigneeUserId: next.assigneeUserId,
			changed: true,
			event: next.event,
			endAssignmentReason: state.assigneeUserId ? (next.endReason ?? null) : null,
			startAssignmentFor: next.startFor ?? null,
		},
	};
}

export function decide(state: ConversationState, command: ConversationCommand): Decision {
	const fail = (reason: string): Decision => ({ ok: false, reason });
	const assigned = state.status === "ASSIGNED_TO_AGENT" && state.assigneeUserId !== null;

	switch (command.type) {
		case "claim":
			if (assigned) return fail("The conversation is already assigned");
			if (!isOpen(state.status)) return fail("The conversation is not open");
			return change(state, { status: "ASSIGNED_TO_AGENT", assigneeUserId: command.agentId, event: "claimed", startFor: command.agentId });

		case "assign":
			if (!isOpen(state.status)) return fail("The conversation is not open");
			if (assigned && state.assigneeUserId === command.agentId) return unchanged(state);
			return change(state, {
				status: "ASSIGNED_TO_AGENT",
				assigneeUserId: command.agentId,
				event: assigned ? "reassigned" : "assigned",
				startFor: command.agentId,
				endReason: "REASSIGNED",
			});

		case "transfer":
			if (!assigned) return fail("Only an assigned conversation can be transferred");
			if (state.assigneeUserId === command.agentId) return fail("The conversation is already assigned to that agent");
			return change(state, {
				status: "ASSIGNED_TO_AGENT",
				assigneeUserId: command.agentId,
				event: "transferred",
				startFor: command.agentId,
				endReason: "TRANSFERRED",
			});

		case "release":
			if (!assigned) return fail("The conversation is not assigned");
			return change(state, { status: "WAITING_FOR_AGENT", assigneeUserId: null, event: "released", endReason: "RELEASED" });

		case "resolve":
			if (state.status === "RESOLVED") return unchanged(state);
			if (!isOpen(state.status)) return fail("The conversation is closed");
			return change(state, { status: "RESOLVED", assigneeUserId: null, event: "resolved", endReason: "RESOLVED" });

		case "reopen":
			if (state.status !== "RESOLVED") return fail("Only resolved conversations can be reopened");
			return change(state, { status: "WAITING_FOR_AGENT", assigneeUserId: null, event: "reopened" });

		case "close":
			if (state.status === "CLOSED") return unchanged(state);
			return change(state, { status: "CLOSED", assigneeUserId: null, event: "closed", endReason: "CLOSED" });

		case "escalate":
			if (state.status === "CLOSED") return fail("The conversation is closed");
			if (state.status === "AI_ACTIVE") {
				return change(state, { status: "WAITING_FOR_AGENT", assigneeUserId: null, event: "escalated" });
			}
			if (state.status === "RESOLVED") {
				return change(state, { status: "WAITING_FOR_AGENT", assigneeUserId: null, event: "reopened_by_customer" });
			}
			return unchanged(state);

		case "customer-message":
			if (state.status === "CLOSED") return fail("The conversation is closed");
			if (state.status === "RESOLVED") {
				return change(state, { status: "WAITING_FOR_AGENT", assigneeUserId: null, event: "reopened_by_customer" });
			}
			return unchanged(state);
	}
}

export type PostKind = "customer" | "agent-reply" | "agent-note";

export function canPost(state: ConversationState, kind: PostKind): { ok: true } | { ok: false; reason: string } {
	if (state.status === "CLOSED") return { ok: false, reason: "The conversation is closed" };
	if (kind === "agent-reply") {
		if (state.status === "RESOLVED") return { ok: false, reason: "Reopen the conversation before replying" };
		if (state.status !== "ASSIGNED_TO_AGENT") return { ok: false, reason: "Claim the conversation before replying" };
	}
	return { ok: true };
}
