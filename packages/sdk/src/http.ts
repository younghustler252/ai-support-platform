import { ApiError } from "./errors";
import { createSseParser, type SseMessage } from "./sse";
import { memoryTokenStore, type TokenStore } from "./token-store";

export interface ClientConfig {
	baseUrl: string;
	fetch?: typeof fetch;
	credentials?: RequestCredentials;
	tokens?: TokenStore;
	headers?: () => Record<string, string>;
	onSessionExpired?: () => void;
	now?: () => number;
}

export interface RequestOptions {
	body?: unknown;
	query?: Record<string, string | number | boolean | undefined | null>;
	auth?: boolean;
	signal?: AbortSignal;
}

interface TokenResponse {
	accessToken: string;
	expiresIn: number;
}

const EXPIRY_MARGIN_MS = 10_000;

export class HttpClient {
	private readonly fetchImpl: typeof fetch;
	private readonly tokens: TokenStore;
	private readonly now: () => number;
	private refreshing: Promise<boolean> | null = null;

	constructor(private readonly config: ClientConfig) {
		this.fetchImpl = config.fetch ?? ((input, init) => globalThis.fetch(input, init));
		this.tokens = config.tokens ?? memoryTokenStore();
		this.now = config.now ?? Date.now;
	}

	setAccessToken(token: TokenResponse | null): void {
		this.tokens.set(token ? { value: token.accessToken, expiresAt: this.now() + token.expiresIn * 1000 } : null);
	}

	hasAccessToken(): boolean {
		return this.tokens.get() !== null;
	}

	refresh(): Promise<boolean> {
		if (!this.refreshing) {
			this.refreshing = this.performRefresh().finally(() => {
				this.refreshing = null;
			});
		}
		return this.refreshing;
	}

	async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
		return (await this.parse<T>(await this.execute(method, path, options))).data;
	}

	async requestPage<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; nextCursor: string | null }> {
		const envelope = await this.parse<T>(await this.execute("GET", path, options));
		return { data: envelope.data, nextCursor: envelope.meta?.nextCursor ?? null };
	}

	private async execute(method: string, path: string, options: RequestOptions): Promise<Response> {
		const authenticated = options.auth !== false;
		if (authenticated) await this.ensureFreshToken();

		let response = await this.send(method, path, options, authenticated);
		if (response.status === 401 && authenticated) {
			if (await this.refresh()) {
				response = await this.send(method, path, options, authenticated);
			} else {
				this.expire();
			}
		}
		return response;
	}

	get<T>(path: string, options?: RequestOptions): Promise<T> {
		return this.request<T>("GET", path, options);
	}

	post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
		return this.request<T>("POST", path, { ...options, body });
	}

	patch<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
		return this.request<T>("PATCH", path, { ...options, body });
	}

	put<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
		return this.request<T>("PUT", path, { ...options, body });
	}

	delete<T>(path: string, options?: RequestOptions): Promise<T> {
		return this.request<T>("DELETE", path, options);
	}

	async stream(path: string, onMessage: (message: SseMessage) => void, signal: AbortSignal): Promise<void> {
		await this.ensureFreshToken();
		let response = await this.openStream(path, signal);
		if (response.status === 401) {
			if (!(await this.refresh())) {
				this.expire();
				throw new ApiError({ status: 401, code: "UNAUTHENTICATED", message: "Session expired" });
			}
			response = await this.openStream(path, signal);
		}
		if (!response.ok || !response.body) {
			throw new ApiError({ status: response.status, code: "STREAM_FAILED", message: `Stream failed with status ${response.status}` });
		}

		const parser = createSseParser(onMessage);
		const decoder = new TextDecoder();
		const reader = response.body.getReader();
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) return;
				parser.push(decoder.decode(value, { stream: true }));
			}
		} finally {
			reader.releaseLock();
		}
	}

	private async openStream(path: string, signal: AbortSignal): Promise<Response> {
		const headers: Record<string, string> = { Accept: "text/event-stream", ...this.config.headers?.() };
		const token = this.tokens.get();
		if (token) headers.Authorization = `Bearer ${token.value}`;
		try {
			return await this.fetchImpl(this.url(path, undefined), {
				method: "GET",
				headers,
				credentials: this.config.credentials ?? "include",
				signal,
			});
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") throw error;
			throw new ApiError({ status: 0, code: "NETWORK_ERROR", message: "Could not reach the server" });
		}
	}

	private expire(): void {
		this.tokens.set(null);
		this.config.onSessionExpired?.();
	}

	private async ensureFreshToken(): Promise<void> {
		const token = this.tokens.get();
		if (token && token.expiresAt - this.now() > EXPIRY_MARGIN_MS) return;
		if (!(await this.refresh()) && token) this.expire();
	}

	private async performRefresh(): Promise<boolean> {
		const response = await this.send("POST", "/auth/refresh", {}, false);
		if (!response.ok) {
			if (response.status === 401 || response.status === 403) this.tokens.set(null);
			return false;
		}
		const body = (await response.json().catch(() => null)) as { data?: TokenResponse } | null;
		if (!body?.data?.accessToken) return false;
		this.setAccessToken(body.data);
		return true;
	}

	private async send(method: string, path: string, options: RequestOptions, authenticated: boolean): Promise<Response> {
		const headers: Record<string, string> = { Accept: "application/json", ...this.config.headers?.() };
		if (options.body !== undefined) headers["Content-Type"] = "application/json";
		const token = this.tokens.get();
		if (authenticated && token) headers.Authorization = `Bearer ${token.value}`;

		try {
			return await this.fetchImpl(this.url(path, options.query), {
				method,
				headers,
				body: options.body === undefined ? undefined : JSON.stringify(options.body),
				credentials: this.config.credentials ?? "include",
				signal: options.signal,
			});
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") throw error;
			throw new ApiError({ status: 0, code: "NETWORK_ERROR", message: "Could not reach the server" });
		}
	}

	private url(path: string, query: RequestOptions["query"]): string {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(query ?? {})) {
			if (value !== undefined && value !== null) params.set(key, String(value));
		}
		const search = params.toString();
		return `${this.config.baseUrl.replace(/\/$/, "")}${path}${search ? `?${search}` : ""}`;
	}

	private async parse<T>(response: Response): Promise<{ data: T; meta?: { nextCursor?: string | null } }> {
		if (response.status === 204) return { data: undefined as T };
		const body = (await response.json().catch(() => null)) as {
			data?: T;
			meta?: { nextCursor?: string | null };
			error?: { code?: string; message?: string; details?: unknown; requestId?: string };
		} | null;

		if (!response.ok) {
			throw new ApiError({
				status: response.status,
				code: body?.error?.code ?? "UNKNOWN_ERROR",
				message: body?.error?.message ?? `Request failed with status ${response.status}`,
				details: body?.error?.details,
				requestId: body?.error?.requestId ?? response.headers.get("x-request-id") ?? undefined,
			});
		}
		if (body === null || body.data === undefined) {
			throw new ApiError({ status: response.status, code: "INVALID_RESPONSE", message: "The server sent an unexpected response" });
		}
		return { data: body.data, meta: body.meta };
	}
}
