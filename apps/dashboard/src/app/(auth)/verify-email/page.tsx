"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Alert, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { useAction, useHashToken } from "@/lib/hooks";

export default function VerifyEmailPage() {
	const token = useHashToken();
	const [verified, setVerified] = useState(false);
	const started = useRef(false);
	const verify = useAction(async (value: string) => {
		await api.auth.verifyEmail(value);
		setVerified(true);
	});

	useEffect(() => {
		if (!token || started.current) return;
		started.current = true;
		void verify.run(token);
	}, [token, verify]);

	if (token === undefined || (token && !verified && !verify.error)) return <Spinner label="Verifying your email" />;

	if (verified) {
		return (
			<Card title="Email verified" subtitle="Your account is ready.">
				<Link href="/login">Continue to sign in</Link>
			</Card>
		);
	}

	return (
		<Card title="Verification failed">
			<div className="stack">
				<Alert>{token ? describeError(verify.error, "This link is invalid or has expired.") : "This link is missing its token."}</Alert>
				<Link href="/login">Back to sign in</Link>
			</div>
		</Card>
	);
}
