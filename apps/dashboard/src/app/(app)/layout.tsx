"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Button, Spinner } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function AppLayout({ children }: { children: ReactNode }) {
	const { state, logout } = useSession();
	const router = useRouter();

	useEffect(() => {
		if (state.status === "anonymous") router.replace("/login");
	}, [state.status, router]);

	if (state.status !== "authenticated") return <Spinner label="Loading your workspace" />;

	return (
		<>
			<header className="app-header">
				<strong>SupportAI</strong>
				<div className="app-user">
					<span>{state.user.displayName ?? state.user.email}</span>
					<Button variant="secondary" onClick={() => void logout()}>
						Sign out
					</Button>
				</div>
			</header>
			<main className="app-main">{children}</main>
		</>
	);
}
