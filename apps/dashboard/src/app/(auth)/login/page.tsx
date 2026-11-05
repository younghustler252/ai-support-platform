"use client";

import { ApiError, fieldErrors } from "@platform/sdk";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Alert, Button, Card, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";

export default function LoginPage() {
	const { login } = useSession();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [resent, setResent] = useState(false);

	const submit = useAction(() => login(email, password));
	const resend = useAction(async () => {
		await api.auth.resendVerification(email);
		setResent(true);
	});

	const unverified = submit.error instanceof ApiError && submit.error.code === "EMAIL_NOT_VERIFIED";
	const errors = fieldErrors(submit.error);

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		setResent(false);
		void submit.run();
	}

	return (
		<Card title="Sign in" subtitle="Welcome back.">
			<form className="stack" onSubmit={onSubmit} noValidate>
				{submit.error ? <Alert>{unverified ? "Verify your email address before signing in." : describeError(submit.error)}</Alert> : null}
				{unverified && !resent ? (
					<Button type="button" variant="secondary" loading={resend.pending} onClick={() => void resend.run()}>
						Resend verification email
					</Button>
				) : null}
				{resent ? <Alert tone="success">If the address is registered, a new verification email is on its way.</Alert> : null}
				<Field label="Email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} error={errors.email} />
				<Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} error={errors.password} />
				<Button type="submit" loading={submit.pending}>
					Sign in
				</Button>
			</form>
			<div className="links">
				<Link href="/forgot-password">Forgot password?</Link>
				<Link href="/register">Create account</Link>
			</div>
		</Card>
	);
}
