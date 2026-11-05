"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useSession } from "@/lib/session";

export default function AuthLayout({ children }: { children: ReactNode }) {
	const { state } = useSession();
	const router = useRouter();

	useEffect(() => {
		if (state.status === "authenticated") router.replace("/");
	}, [state.status, router]);

	return (
		<div className="auth-shell">
			<div className="auth-wrap">
				<div className="auth-brand">SupportAI</div>
				{children}
			</div>
		</div>
	);
}
