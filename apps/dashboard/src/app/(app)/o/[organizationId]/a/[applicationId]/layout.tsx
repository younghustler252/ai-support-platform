"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import { Alert, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { ApplicationContext, useOrganization } from "@/lib/context";
import { describeError } from "@/lib/errors";
import { useAsync } from "@/lib/hooks";

const tabs = [
	{ label: "Overview", segment: "" },
	{ label: "Inbox", segment: "inbox" },
] as const;

export default function ApplicationLayout({ children }: { children: ReactNode }) {
	const { organization } = useOrganization();
	const { applicationId } = useParams<{ applicationId: string }>();
	const pathname = usePathname();
	const application = useAsync(() => api.applications.get(organization.id, applicationId));

	const value = useMemo(
		() => (application.data ? { application: application.data, reload: application.reload } : null),
		[application.data, application.reload],
	);

	if (application.loading && !application.data) return <Spinner />;
	if (application.error || !value) {
		return (
			<div className="stack">
				<Alert>{application.error ? describeError(application.error, "This application does not exist or you do not have access to it.") : "Application not found."}</Alert>
				<Link href={`/o/${organization.id}`}>Back to applications</Link>
			</div>
		);
	}

	const base = `/o/${organization.id}/a/${applicationId}`;

	return (
		<ApplicationContext.Provider value={value}>
			<div className="row">
				<div>
					<h1>{value.application.name}</h1>
					<p className="muted">
						<Link href={`/o/${organization.id}`}>{organization.name}</Link>
					</p>
				</div>
			</div>
			<nav className="tabs" aria-label="Application sections">
				{tabs.map((tab) => {
					const href = tab.segment ? `${base}/${tab.segment}` : base;
					return (
						<Link key={tab.label} href={href} className="tab" aria-current={pathname === href || (tab.segment !== "" && pathname.startsWith(`${href}/`)) ? "page" : undefined}>
							{tab.label}
						</Link>
					);
				})}
			</nav>
			{children}
		</ApplicationContext.Provider>
	);
}
