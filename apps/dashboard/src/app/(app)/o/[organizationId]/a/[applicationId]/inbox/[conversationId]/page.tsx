"use client";

import type { ApplicationMember, Conversation, ConversationAction, Message } from "@platform/sdk";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Alert, Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useApplication, useOrganization } from "@/lib/context";
import { describeError } from "@/lib/errors";
import { useAction } from "@/lib/hooks";
import { customerName, formatTime, statusLabels, useAgentEvents, useDebounced } from "@/lib/inbox";
import { useSession } from "@/lib/session";

const senderLabels = { CUSTOMER: "Customer", AI: "AI assistant", AGENT: "Agent", SYSTEM: "System" } as const;

export default function ConversationPage() {
	const { organization } = useOrganization();
	const { application } = useApplication();
	const { conversationId } = useParams<{ conversationId: string }>();
	const { state } = useSession();
	const currentUserId = state.status === "authenticated" ? state.user.id : null;

	const [conversation, setConversation] = useState<Conversation | null>(null);
	const [messages, setMessages] = useState<Message[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<unknown>(null);
	const [draft, setDraft] = useState("");
	const [internal, setInternal] = useState(false);
	const [members, setMembers] = useState<ApplicationMember[]>([]);
	const [target, setTarget] = useState("");
	const endRef = useRef<HTMLLIElement>(null);

	const load = useCallback(
		async (quiet: boolean) => {
			if (!quiet) setLoading(true);
			try {
				const [fresh, collected] = await Promise.all([
					api.conversations.get(organization.id, application.id, conversationId),
					collectMessages(organization.id, application.id, conversationId),
				]);
				setConversation(fresh);
				setMessages(collected);
				setError(null);
			} catch (caught) {
				setError(caught);
			} finally {
				setLoading(false);
			}
		},
		[organization.id, application.id, conversationId],
	);

	useEffect(() => {
		void load(false);
	}, [load]);

	const refresh = useDebounced(() => void load(true), 200);
	const live = useAgentEvents(organization.id, application.id, (event) => {
		if (event.conversationId === conversationId) refresh();
	});

	useEffect(() => {
		api.members
			.listForApplication(organization.id, application.id)
			.then(setMembers)
			.catch(() => setMembers([]));
	}, [organization.id, application.id]);

	useEffect(() => {
		endRef.current?.scrollIntoView({ block: "end" });
	}, [messages.length]);

	const send = useAction(async () => {
		const body = draft.trim();
		if (!body) return;
		await api.conversations.send(organization.id, application.id, conversationId, { body, internal });
		setDraft("");
		await load(true);
	});

	const act = useAction(async (action: ConversationAction) => {
		setConversation(await api.conversations.perform(organization.id, application.id, conversationId, action));
		await load(true);
	});

	const handOff = useAction(async () => {
		if (!target || !conversation) return;
		const updated =
			conversation.assigneeUserId === null
				? await api.conversations.assign(organization.id, application.id, conversationId, target)
				: await api.conversations.transfer(organization.id, application.id, conversationId, target);
		setConversation(updated);
		setTarget("");
		await load(true);
	});

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		void send.run();
	}

	function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void send.run();
		}
	}

	const back = `/o/${organization.id}/a/${application.id}/inbox`;

	if (loading && !conversation) return <Spinner label="Loading conversation" />;
	if (error && !conversation) {
		return (
			<div className="stack">
				<Alert>{describeError(error, "Could not load this conversation.")}</Alert>
				<Link href={back}>Back to inbox</Link>
			</div>
		);
	}
	if (!conversation) return null;

	const closed = conversation.status === "CLOSED";
	const mine = conversation.assigneeUserId !== null && conversation.assigneeUserId === currentUserId;
	const claimable = conversation.status === "AI_ACTIVE" || conversation.status === "WAITING_FOR_AGENT";

	return (
		<div className="thread">
			<div className="row">
				<Link href={back}>← Inbox</Link>
				<span className={`live ${live ? "live-on" : ""}`} role="status">
					{live ? "Live" : "Reconnecting"}
				</span>
			</div>

			<header className="thread-header">
				<div className="grow">
					<h2>{customerName(conversation)}</h2>
					<p className="muted">
						{conversation.subject ?? "No subject"} · {conversation.assignee ? `With ${conversation.assignee.displayName ?? conversation.assignee.email}` : "Unassigned"}
					</p>
				</div>
				<span className="badge">{statusLabels[conversation.status]}</span>
			</header>

			<div className="actions">
				{claimable ? (
					<Button loading={act.pending} onClick={() => void act.run("claim")}>
						Claim
					</Button>
				) : null}
				{conversation.status === "ASSIGNED_TO_AGENT" && mine ? (
					<Button variant="secondary" loading={act.pending} onClick={() => void act.run("release")}>
						Release
					</Button>
				) : null}
				{conversation.status !== "RESOLVED" && !closed ? (
					<Button variant="secondary" loading={act.pending} onClick={() => void act.run("resolve")}>
						Resolve
					</Button>
				) : null}
				{conversation.status === "RESOLVED" ? (
					<Button variant="secondary" loading={act.pending} onClick={() => void act.run("reopen")}>
						Reopen
					</Button>
				) : null}
				{!closed ? (
					<Button variant="ghost" loading={act.pending} onClick={() => void act.run("close")}>
						Close
					</Button>
				) : null}
			</div>

			{!closed && conversation.status !== "RESOLVED" ? (
				<div className="actions">
					<select aria-label="Hand off to" value={target} onChange={(event) => setTarget(event.target.value)}>
						<option value="">{conversation.assigneeUserId === null ? "Assign to…" : "Transfer to…"}</option>
						{members
							.filter((member) => member.userId !== conversation.assigneeUserId)
							.map((member) => (
								<option key={member.userId} value={member.userId}>
									{member.displayName ?? member.email}
								</option>
							))}
					</select>
					<Button variant="secondary" loading={handOff.pending} disabled={!target} onClick={() => void handOff.run()}>
						{conversation.assigneeUserId === null ? "Assign" : "Transfer"}
					</Button>
				</div>
			) : null}

			{handOff.error ? <Alert>{describeError(handOff.error, "That hand-off could not be completed.")}</Alert> : null}
			{act.error ? <Alert>{describeError(act.error, "That action could not be completed.")}</Alert> : null}

			<ol className="messages" aria-live="polite">
				{messages.map((message) => (
					<li key={message.id} className={`message message-${message.sender.toLowerCase()} ${message.internal ? "message-internal" : ""}`}>
						<div className="message-meta">
							<span>{message.internal ? "Internal note" : senderLabels[message.sender]}</span>
							<time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
						</div>
						<p>{message.body}</p>
					</li>
				))}
				<li ref={endRef} aria-hidden="true" />
			</ol>

			{closed ? (
				<Alert tone="info">This conversation is closed.</Alert>
			) : (
				<form className="composer" onSubmit={onSubmit}>
					<textarea
						aria-label={internal ? "Internal note" : "Reply to customer"}
						className={internal ? "composer-note" : undefined}
						rows={3}
						value={draft}
						maxLength={10000}
						placeholder={internal ? "Write a note only your team can see" : "Write a reply"}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={onKeyDown}
					/>
					{send.error ? <Alert>{describeError(send.error, "Your message could not be sent.")}</Alert> : null}
					<div className="row">
						<label className="check">
							<input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} />
							Internal note
						</label>
						<Button type="submit" loading={send.pending} disabled={!draft.trim()}>
							{internal ? "Add note" : "Send reply"}
						</Button>
					</div>
				</form>
			)}
		</div>
	);
}

async function collectMessages(organizationId: string, applicationId: string, conversationId: string): Promise<Message[]> {
	const collected: Message[] = [];
	let cursor: string | undefined;
	for (let page = 0; page < 10; page += 1) {
		const result = await api.conversations.messages(organizationId, applicationId, conversationId, { limit: 100, cursor });
		collected.push(...result.items);
		if (!result.nextCursor) break;
		cursor = result.nextCursor;
	}
	return collected;
}
