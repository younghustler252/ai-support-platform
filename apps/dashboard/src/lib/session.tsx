"use client";

import type { User } from "@platform/sdk";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, onSessionExpired } from "./api";

type State = { status: "loading" } | { status: "anonymous" } | { status: "authenticated"; user: User };

interface SessionValue {
	state: State;
	login(email: string, password: string): Promise<void>;
	logout(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<State>({ status: "loading" });

	useEffect(() => {
		let active = true;
		onSessionExpired(() => setState({ status: "anonymous" }));
		api.auth
			.restore()
			.then((user) => active && setState(user ? { status: "authenticated", user } : { status: "anonymous" }))
			.catch(() => active && setState({ status: "anonymous" }));
		return () => {
			active = false;
			onSessionExpired(null);
		};
	}, []);

	const login = useCallback(async (email: string, password: string) => {
		const user = await api.auth.login({ email, password });
		setState({ status: "authenticated", user });
	}, []);

	const logout = useCallback(async () => {
		await api.auth.logout().catch(() => undefined);
		setState({ status: "anonymous" });
	}, []);

	const value = useMemo(() => ({ state, login, logout }), [state, login, logout]);
	return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
	const value = useContext(SessionContext);
	if (!value) throw new Error("useSession must be used inside SessionProvider");
	return value;
}
