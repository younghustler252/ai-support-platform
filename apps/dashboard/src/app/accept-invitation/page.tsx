"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Alert, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { useAction, useHashToken } from "@/lib/hooks";
import { useSession } from "@/lib/session";

export default function AcceptInvitationPage() {
	const token = useHashToken();
	const { state } = useSession();
	const [kept, setKept] = useState<string | null>(null);
	const [accepted, setAccepted] = useState<{ id: string; name: string } | null>(null);
	const started = useRef(false);
	const accept = useAction(async (value: string) => {
		const result = await api.invitations.accept(value);
		setAccepted(result.organization);
	});

	useEffect(() => {
		if (token) setKept(token);
	}, [token]);

	useEffect(() => {
		if (!kept || state.status !== "authenticated" || started.current) return;
		started.current = true;
		void accept.run(kept);
	}, [kept, state.status, accept]);

	if (token === undefined || state.status === "loading") return <Shell><Spinner /></Shell>;

	if (!kept && !accepted) {
		return (
			<Shell>
				<Card title="Invitation not valid">
					<Alert>This link is missing its token.</Alert>
				</Card>
			</Shell>
		);
	}

	if (state.status === "anonymous") {
		const next = encodeURIComponent(`/accept-invitation#token=${kept}`);
		return (
			<Shell>
				<Card title="You have been invited" subtitle="Sign in with the email address the invitation was sent to.">
					<div className="stack">
						<Link className="btn btn-primary" href={`/login?next=${next}`}>
							Sign in
						</Link>
						<Link href="/register">New here? Create an account, verify your email, then open this invitation link again.</Link>
					</div>
				</Card>
			</Shell>
		);
	}

	if (accepted) {
		return (
			<Shell>
				<Card title={`Welcome to ${accepted.name}`} subtitle="The invitation was accepted.">
					<Link className="btn btn-primary" href={`/o/${accepted.id}`}>
						Open organization
					</Link>
				</Card>
			</Shell>
		);
	}

	if (accept.error) {
		return (
			<Shell>
				<Card title="Could not accept the invitation">
					<div className="stack">
						<Alert>{describeError(accept.error, "This invitation is invalid, expired, or was sent to a different email address.")}</Alert>
						<Link href="/">Go to your organizations</Link>
					</div>
				</Card>
			</Shell>
		);
	}

	return <Shell><Spinner label="Accepting your invitation" /></Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="auth-shell">
			<div className="auth-wrap">
				<div className="auth-brand">SupportAI</div>
				{children}
			</div>
		</div>
	);
}
