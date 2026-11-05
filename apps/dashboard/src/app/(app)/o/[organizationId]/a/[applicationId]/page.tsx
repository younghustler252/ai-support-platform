"use client";

import { fieldErrors } from "@platform/sdk";
import { useState, type FormEvent } from "react";

import { Alert, Button, Field, TextArea } from "@/components/ui";
import { api } from "@/lib/api";
import { useApplication, useOrganization } from "@/lib/context";
import { describeError } from "@/lib/errors";
import { useAction } from "@/lib/hooks";

export default function ApplicationOverviewPage() {
	const { organization } = useOrganization();
	const { application, reload } = useApplication();
	const [name, setName] = useState(application.name);
	const [description, setDescription] = useState(application.description ?? "");
	const [origins, setOrigins] = useState(application.allowedOrigins.join("\n"));
	const [saved, setSaved] = useState(false);

	const save = useAction(async () => {
		await api.applications.update(organization.id, application.id, {
			name: name.trim(),
			description: description.trim() ? description.trim() : null,
			allowedOrigins: origins
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter(Boolean),
		});
		await reload();
		setSaved(true);
	});
	const errors = fieldErrors(save.error);
	const originError = Object.entries(errors).find(([path]) => path.startsWith("allowedOrigins"))?.[1];

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		setSaved(false);
		void save.run();
	}

	return (
		<form className="card stack" onSubmit={onSubmit} noValidate>
			<h2>Application details</h2>
			{save.error && Object.keys(errors).length === 0 ? <Alert>{describeError(save.error)}</Alert> : null}
			{saved ? <Alert tone="success">Changes saved.</Alert> : null}
			<Field label="Name" required value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
			<Field label="Description" value={description} onChange={(event) => setDescription(event.target.value)} error={errors.description} />
			<TextArea
				label="Allowed origins"
				value={origins}
				onChange={(event) => setOrigins(event.target.value)}
				error={originError}
				hint="Websites allowed to use the chat widget, one per line, for example https://example.com"
			/>
			<div>
				<Button type="submit" loading={save.pending}>
					Save changes
				</Button>
			</div>
		</form>
	);
}
