"use client";

import { ApiError } from "@platform/sdk";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import { Alert, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { OrganizationContext } from "@/lib/context";
import { describeError } from "@/lib/errors";
import { useAsync } from "@/lib/hooks";

export default function OrganizationLayout({ children }: { children: ReactNode }) {
	const { organizationId } = useParams<{ organizationId: string }>();
	const router = useRouter();
	const organizations = useAsync(() => api.organizations.list());

	const value = useMemo(() => {
		const list = organizations.data ?? [];
		const organization = list.find((item) => item.id === organizationId);
		return organization ? { organization, organizations: list } : null;
	}, [organizations.data, organizationId]);

	if (organizations.loading && !organizations.data) return <Spinner />;
	if (organizations.error) return <Alert>{describeError(organizations.error)}</Alert>;

	if (!value) {
		const missing = !(organizations.error instanceof ApiError);
		return (
			<div className="stack">
				<Alert>{missing ? "This organization does not exist or you do not have access to it." : "Could not load the organization."}</Alert>
				<Link href="/">Back to your organizations</Link>
			</div>
		);
	}

	return (
		<OrganizationContext.Provider value={value}>
			<nav className="crumbs" aria-label="Organization">
				<Link href="/">Organizations</Link>
				<span aria-hidden="true">/</span>
				<label className="sr-only" htmlFor="org-switcher">
					Switch organization
				</label>
				<select id="org-switcher" value={value.organization.id} onChange={(event) => router.push(`/o/${event.target.value}`)}>
					{value.organizations.map((item) => (
						<option key={item.id} value={item.id}>
							{item.name}
						</option>
					))}
				</select>
			</nav>
			{children}
		</OrganizationContext.Provider>
	);
}
