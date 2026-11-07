"use client";

import type { Conversation } from "@platform/sdk";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert, Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useApplication, useOrganization } from "@/lib/context";
import { describeError } from "@/lib/errors";
import { customerName, formatTime, inboxViews, statusLabels, useAgentEvents, useDebounced } from "@/lib/inbox";

export default function InboxPage() {
	const { organization } = useOrganization();
	const { application } = useApplication();
	const [viewId, setViewId] = useState(inboxViews[0]!.id);
	const [items, setItems] = useState<Conversation[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const requestId = useRef(0);

	const view = inboxViews.find((candidate) => candidate.id === viewId) ?? inboxViews[0]!;

	const load = useCallback(
		async (quiet: boolean) => {
			const current = ++requestId.current;
			if (!quiet) setLoading(true);
			try {
				const page = await api.conversations.list(organization.id, application.id, {
					status: view.status,
					assignee: view.assignee,
					limit: 25,
				});
				if (current !== requestId.current) return;
				setItems(page.items);
				setNextCursor(page.nextCursor);
				setError(null);
			} catch (caught) {
				if (current === requestId.current) setError(caught);
			} finally {
				if (current === requestId.current) setLoading(false);
			}
		},
		[organization.id, application.id, view],
	);

	useEffect(() => {
		void load(false);
	}, [load]);

	const refresh = useDebounced(() => void load(true), 300);
	const live = useAgentEvents(organization.id, application.id, refresh);

	async function loadMore() {
		if (!nextCursor) return;
		setLoadingMore(true);
		try {
			const page = await api.conversations.list(organization.id, application.id, {
				status: view.status,
				assignee: view.assignee,
				limit: 25,
				cursor: nextCursor,
			});
			setItems((existing) => [...existing, ...page.items.filter((item) => !existing.some((known) => known.id === item.id))]);
			setNextCursor(page.nextCursor);
		} catch (caught) {
			setError(caught);
		} finally {
			setLoadingMore(false);
		}
	}

	const base = `/o/${organization.id}/a/${application.id}/inbox`;

	return (
		<div className="stack">
			<div className="row">
				<div className="chips" role="tablist" aria-label="Inbox views">
					{inboxViews.map((candidate) => (
						<button
							key={candidate.id}
							type="button"
							role="tab"
							className="chip"
							aria-selected={candidate.id === viewId}
							onClick={() => setViewId(candidate.id)}
						>
							{candidate.label}
						</button>
					))}
				</div>
				<span className={`live ${live ? "live-on" : ""}`} role="status">
					{live ? "Live" : "Reconnecting"}
				</span>
			</div>

			{error ? <Alert>{describeError(error, "Could not load conversations.")}</Alert> : null}
			{loading ? <Spinner label="Loading conversations" /> : null}

			{!loading && !error && items.length === 0 ? <p className="muted">No conversations here yet.</p> : null}

			<ul className="list">
				{items.map((conversation) => (
					<li key={conversation.id}>
						<Link href={`${base}/${conversation.id}`} className="list-item">
							<div className="grow">
								<strong>{customerName(conversation)}</strong>
								<small>{conversation.subject ?? "No subject"}</small>
							</div>
							<div className="meta">
								<span className="badge">{statusLabels[conversation.status]}</span>
								<small>{conversation.assignee ? (conversation.assignee.displayName ?? conversation.assignee.email) : "Unassigned"}</small>
								<small>{formatTime(conversation.lastMessageAt ?? conversation.createdAt)}</small>
							</div>
						</Link>
					</li>
				))}
			</ul>

			{nextCursor ? (
				<Button variant="secondary" loading={loadingMore} onClick={() => void loadMore()}>
					Load more
				</Button>
			) : null}
		</div>
	);
}
