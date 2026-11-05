"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useAction<A extends unknown[]>(action: (...args: A) => Promise<void>) {
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<unknown>(null);

	const run = useCallback(
		async (...args: A): Promise<boolean> => {
			setPending(true);
			setError(null);
			try {
				await action(...args);
				return true;
			} catch (caught) {
				setError(caught);
				return false;
			} finally {
				setPending(false);
			}
		},
		[action],
	);

	return { run, pending, error, clearError: () => setError(null) };
}

export function useAsync<T>(load: () => Promise<T>) {
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState<unknown>(null);
	const [loading, setLoading] = useState(true);
	const loader = useRef(load);
	loader.current = load;

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			setData(await loader.current());
			setError(null);
		} catch (caught) {
			setError(caught);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	return { data, error, loading, reload };
}

export function useHashToken(): string | null | undefined {
	const [token, setToken] = useState<string | null | undefined>(undefined);

	useEffect(() => {
		const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
		setToken(value);
		if (value) window.history.replaceState(null, "", window.location.pathname + window.location.search);
	}, []);

	return token;
}
