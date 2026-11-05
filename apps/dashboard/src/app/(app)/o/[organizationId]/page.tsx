"use client";

import { fieldErrors } from "@platform/sdk";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Alert, Button, Field, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useOrganization } from "@/lib/context";
import { describeError } from "@/lib/errors";
import { useAction, useAsync } from "@/lib/hooks";

export default function ApplicationsPage() {
	const { organization } = useOrganization();
	const applications = useAsync(() => api.applications.list(organization.id));
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const canCreate = organization.role !== "MEMBER";

	const create = useAction(async () => {
		await api.applications.create(organization.id, { name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) });
		setName("");
		setDescription("");
		setCreating(false);
		await applications.reload();
	});
	const errors = fieldErrors(create.error);

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		void create.run();
	}

	if (applications.loading && !applications.data) return <Spinner />;
	if (applications.error) return <Alert>{describeError(applications.error)}</Alert>;

	const list = applications.data ?? [];
	const showForm = canCreate && (creating || list.length === 0);

	return (
		<div className="stack">
			<div className="row">
				<div>
					<h1>{organization.name}</h1>
					<p className="muted">
						{list.length === 0 ? "Create an application for each website, app or product you support." : "Applications"}
					</p>
				</div>
				{canCreate && list.length > 0 && !creating ? <Button onClick={() => setCreating(true)}>New application</Button> : null}
			</div>
			{list.length === 0 && !canCreate ? <Alert tone="info">There are no applications yet. Ask an admin to create one.</Alert> : null}
			{list.length > 0 ? (
				<ul className="list">
					{list.map((application) => (
						<li key={application.id}>
							<Link href={`/o/${organization.id}/a/${application.id}`} className="list-item">
								<span>
									{application.name}
									{application.description ? <small>{application.description}</small> : null}
								</span>
							</Link>
						</li>
					))}
				</ul>
			) : null}
			{showForm ? (
				<form className="card stack" onSubmit={onSubmit} noValidate>
					<h2>New application</h2>
					{create.error && Object.keys(errors).length === 0 ? <Alert>{describeError(create.error)}</Alert> : null}
					<Field label="Name" required value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
					<Field label="Description" value={description} onChange={(event) => setDescription(event.target.value)} error={errors.description} hint="Optional" />
					<div className="row">
						<Button type="submit" loading={create.pending}>
							Create application
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
