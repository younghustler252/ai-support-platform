"use client";

import { fieldErrors } from "@platform/sdk";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Alert, Button, Card, Field, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { useAction, useHashToken } from "@/lib/hooks";

export default function ResetPasswordPage() {
	const token = useHashToken();
	const [saved, setSaved] = useState<string | null>(null);
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [mismatch, setMismatch] = useState(false);
	const submit = useAction(async (value: string) => {
		await api.auth.resetPassword(value, password);
		setSaved(value);
	});
	const errors = fieldErrors(submit.error);

	if (token === undefined && saved === null) return <Spinner />;

	if (saved) {
		return (
			<Card title="Password updated" subtitle="You can now sign in with your new password.">
				<Link href="/login">Continue to sign in</Link>
			</Card>
		);
	}

	const activeToken = token ?? "";
	if (!activeToken) {
		return (
			<Card title="Link not valid">
				<div className="stack">
					<Alert>This reset link is missing its token or has already been used.</Alert>
					<Link href="/forgot-password">Request a new link</Link>
				</div>
			</Card>
		);
	}

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		if (password !== confirm) {
			setMismatch(true);
			return;
		}
		setMismatch(false);
		void submit.run(activeToken);
	}

	return (
		<Card title="Choose a new password">
			<form className="stack" onSubmit={onSubmit} noValidate>
				{submit.error && Object.keys(errors).length === 0 ? <Alert>{describeError(submit.error, "This link is invalid or has expired.")}</Alert> : null}
				<Field label="New password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} error={errors.password} hint="At least 12 characters." />
				<Field label="Confirm password" type="password" autoComplete="new-password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} error={mismatch ? "Passwords do not match" : undefined} />
				<Button type="submit" loading={submit.pending}>
					Update password
				</Button>
			</form>
		</Card>
	);
}
