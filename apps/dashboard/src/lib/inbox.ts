"use client";

import type { AgentEvent, Conversation, ConversationStatus } from "@platform/sdk";
import { useEffect, useRef, useState } from "react";

import { api } from "./api";

export const statusLabels: Record<ConversationStatus, string> = {
	AI_ACTIVE: "AI handling",
	WAITING_FOR_AGENT: "Needs an agent",
	ASSIGNED_TO_AGENT: "With an agent",
	RESOLVED: "Resolved",
	CLOSED: "Closed",
};

export interface InboxView {
	id: string;
	label: string;
	status: ConversationStatus[];
	assignee?: "me" | "unassigned";
}

export const inboxViews: InboxView[] = [
	{ id: "waiting", label: "Needs an agent", status: ["WAITING_FOR_AGENT"] },
	{ id: "mine", label: "Mine", status: ["ASSIGNED_TO_AGENT"], assignee: "me" },
	{ id: "open", label: "All open", status: ["AI_ACTIVE", "WAITING_FOR_AGENT", "ASSIGNED_TO_AGENT"] },
	{ id: "done", label: "Resolved", status: ["RESOLVED", "CLOSED"] },
];

export function customerName(conversation: Conversation): string {
	const { customer } = conversation;
	return customer.displayName ?? customer.email ?? customer.externalId ?? "Anonymous visitor";
}

export function formatTime(value: string | null): string {
	if (!value) return "";
	const date = new Date(value);
	const sameDay = date.toDateString() === new Date().toDateString();
	return sameDay
		? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
		: date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function useAgentEvents(organizationId: string, applicationId: string, onEvent: (event: AgentEvent) => void): boolean {
	const [connected, setConnected] = useState(false);
	const handler = useRef(onEvent);
	handler.current = onEvent;

	useEffect(() => {
		const subscription = api.events.subscribe(organizationId, applicationId, {
			onEvent: (event) => handler.current(event),
			onStatus: setConnected,
		});
		return () => subscription.close();
	}, [organizationId, applicationId]);

	return connected;
}

export function useDebounced(action: () => void, delay: number): () => void {
	const latest = useRef(action);
	latest.current = action;
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	return () => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => latest.current(), delay);
	};
}
