"use client";

import { fieldErrors } from "@platform/sdk";
import { useState, type FormEvent } from "react";

import { Alert, Button, Field, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { useAction, useAsync } from "@/lib/hooks";

export default function HomePage() {
	const organizations = useAsync(() => api.organizations.list());
	const [name, setName] = useState("");
	const [creating, setCreating] = useState(false);
	const create = useAction(async () => {
		await api.organizations.create({ name: name.trim() });
		setName("");
		setCreating(false);
		await organizations.reload();
	});
	const errors = fieldErrors(create.error);

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		void create.run();
	}

	if (organizations.loading && !organizations.data) return <Spinner />;
	if (organizations.error) return <Alert>{describeError(organizations.error)}</Alert>;

	const list = organizations.data ?? [];
	const showForm = creating || list.length === 0;

	return (
		<div className="stack">
			<div className="row">
				<div>
					<h1>Organizations</h1>
					<p className="muted">{list.length === 0 ? "Create your first organization to get started." : "Choose where to work."}</p>
				</div>
				{list.length > 0 && !creating ? <Button onClick={() => setCreating(true)}>New organization</Button> : null}
			</div>
			{list.length > 0 ? (
				<ul className="list">
					{list.map((organization) => (
						<li key={organization.id} className="list-item">
							<span>{organization.name}</span>
							<span className="badge">{organization.role.toLowerCase()}</span>
						</li>
					))}
				</ul>
			) : null}
			{showForm ? (
				<form className="card stack" onSubmit={onSubmit} noValidate>
					<h2>New organization</h2>
					{create.error && !errors.name ? <Alert>{describeError(create.error)}</Alert> : null}
					<Field label="Name" required value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
					<div className="row">
						<Button type="submit" loading={create.pending}>
							Create organization
						</Button>
						{list.length > 0 ? (
							<Button type="button" variant="ghost" onClick={() => setCreating(false)}>
								Cancel
							</Button>
						) : null}
					</div>
				</form>
			) : null}
		</div>
	);
}
