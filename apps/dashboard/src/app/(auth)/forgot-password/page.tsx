"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Alert, Button, Card, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { useAction } from "@/lib/hooks";

export default function ForgotPasswordPage() {
	const [email, setEmail] = useState("");
	const [sent, setSent] = useState(false);
	const submit = useAction(async () => {
		await api.auth.forgotPassword(email);
		setSent(true);
	});

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		void submit.run();
	}

	return (
		<Card title="Reset your password" subtitle="We will email you a link to choose a new one.">
			{sent ? (
				<div className="stack">
					<Alert tone="success">If an account exists for {email}, a reset link is on its way.</Alert>
					<Link href="/login">Back to sign in</Link>
				</div>
			) : (
				<form className="stack" onSubmit={onSubmit} noValidate>
					{submit.error ? <Alert>{describeError(submit.error)}</Alert> : null}
					<Field label="Email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
					<Button type="submit" loading={submit.pending}>
						Send reset link
					</Button>
					<Link href="/login">Back to sign in</Link>
				</form>
			)}
		</Card>
	);
}
