"use client";

import { fieldErrors } from "@platform/sdk";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Alert, Button, Card, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { useAction } from "@/lib/hooks";

export default function RegisterPage() {
	const [displayName, setDisplayName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [done, setDone] = useState(false);
	const [resent, setResent] = useState(false);

	const submit = useAction(async () => {
		await api.auth.register({ email, password, ...(displayName.trim() ? { displayName: displayName.trim() } : {}) });
		setDone(true);
	});
	const resend = useAction(async () => {
		await api.auth.resendVerification(email);
		setResent(true);
	});
	const errors = fieldErrors(submit.error);

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		void submit.run();
	}

	if (done) {
		return (
			<Card title="Check your email" subtitle={`We sent a verification link to ${email}.`}>
				<div className="stack">
					{resent ? <Alert tone="success">If the address is registered, a new link is on its way.</Alert> : null}
					{resend.error ? <Alert>{describeError(resend.error)}</Alert> : null}
					<Button variant="secondary" loading={resend.pending} onClick={() => void resend.run()}>
						Resend email
					</Button>
					<Link href="/login">Back to sign in</Link>
				</div>
			</Card>
		);
	}

	return (
		<Card title="Create your account" subtitle="Start supporting your customers with AI and your team.">
			<form className="stack" onSubmit={onSubmit} noValidate>
				{submit.error && Object.keys(errors).length === 0 ? <Alert>{describeError(submit.error)}</Alert> : null}
				<Field label="Name" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} error={errors.displayName} />
				<Field label="Email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} error={errors.email} />
				<Field label="Password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} error={errors.password} hint="At least 12 characters." />
				<Button type="submit" loading={submit.pending}>
					Create account
				</Button>
			</form>
			<div className="links">
				<span>Already have an account?</span>
				<Link href="/login">Sign in</Link>
			</div>
		</Card>
	);
}
