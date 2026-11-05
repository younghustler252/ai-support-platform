import assert from "node:assert/strict";
import test from "node:test";

import { ApiError, createClient, fieldErrors } from "../src/index";

interface Call {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
	credentials?: string;
}

type Responder = (call: Call) => Response | Promise<Response>;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const user = { id: "u1", email: "a@example.com", displayName: null, emailVerifiedAt: null };

function setup(responder: Responder, extra: Partial<Parameters<typeof createClient>[0]> = {}) {
	const calls: Call[] = [];
	let now = 1_000_000;
	const expired: number[] = [];
	const client = createClient({
		baseUrl: "https://api.test/api/v1/",
		now: () => now,
		onSessionExpired: () => expired.push(now),
		fetch: async (input, init) => {
			const call: Call = {
				url: String(input),
				method: init?.method ?? "GET",
				headers: { ...(init?.headers as Record<string, string>) },
				body: init?.body as string | undefined,
				credentials: init?.credentials,
			};
			calls.push(call);
			return responder(call);
		},
		...extra,
	});
	return { client, calls, expired, advance: (ms: number) => void (now += ms) };
}

const login = (call: Call) => call.url.endsWith("/auth/login");
const refresh = (call: Call) => call.url.endsWith("/auth/refresh");

test("login stores the access token and later requests send it", async () => {
	const { client, calls } = setup((call) => {
		if (login(call)) return json(200, { data: { user, accessToken: "t1", expiresIn: 900 } });
		return json(200, { data: { organizations: [] } });
	});

	assert.deepEqual(await client.auth.login({ email: "a@example.com", password: "pw" }), user);
	await client.organizations.list();

	assert.equal(calls[1]?.url, "https://api.test/api/v1/organizations");
	assert.equal(calls[1]?.headers.Authorization, "Bearer t1");
	assert.equal(calls[1]?.credentials, "include");
	assert.equal(calls[0]?.headers.Authorization, undefined);
});

test("a 401 triggers one refresh and the request is retried with the new token", async () => {
	let tokenIssued = false;
	const { client, calls } = setup((call) => {
		if (login(call)) return json(200, { data: { user, accessToken: "old", expiresIn: 900 } });
		if (refresh(call)) {
			tokenIssued = true;
			return json(200, { data: { accessToken: "new", expiresIn: 900 } });
		}
		return call.headers.Authorization === "Bearer new" ? json(200, { data: { user } }) : json(401, { error: { code: "AUTHENTICATION_REQUIRED", message: "no" } });
	});

	await client.auth.login({ email: "a@example.com", password: "pw" });
	assert.deepEqual(await client.auth.me(), user);
	assert.equal(tokenIssued, true);
	assert.equal(calls.filter(refresh).length, 1);
	assert.equal(calls.at(-1)?.headers.Authorization, "Bearer new");
});

test("concurrent requests share a single refresh", async () => {
	const { client, calls, advance } = setup(async (call) => {
		if (login(call)) return json(200, { data: { user, accessToken: "old", expiresIn: 60 } });
		if (refresh(call)) {
			await new Promise((resolve) => setTimeout(resolve, 10));
			return json(200, { data: { accessToken: "new", expiresIn: 900 } });
		}
		return json(200, { data: { organizations: [] } });
	});

	await client.auth.login({ email: "a@example.com", password: "pw" });
	advance(55_000);
	await Promise.all([client.organizations.list(), client.organizations.list(), client.organizations.list()]);
	assert.equal(calls.filter(refresh).length, 1);
	assert.ok(calls.filter((call) => call.url.endsWith("/organizations")).every((call) => call.headers.Authorization === "Bearer new"));
});

test("a failed refresh signs the user out and reports the original 401", async () => {
	const { client, expired } = setup((call) => {
		if (login(call)) return json(200, { data: { user, accessToken: "old", expiresIn: 900 } });
		if (refresh(call)) return json(401, { error: { code: "AUTHENTICATION_REQUIRED", message: "expired" } });
		return json(401, { error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication required" } });
	});

	await client.auth.login({ email: "a@example.com", password: "pw" });
	await assert.rejects(client.organizations.list(), (error: unknown) => error instanceof ApiError && error.status === 401);
	assert.equal(client.http.hasAccessToken(), false);
	assert.equal(expired.length, 1);
});

test("a network failure during refresh does not sign the user out", async () => {
	const { client, expired } = setup((call) => {
		if (login(call)) return json(200, { data: { user, accessToken: "old", expiresIn: 900 } });
		throw new TypeError("fetch failed");
	});

	await client.auth.login({ email: "a@example.com", password: "pw" });
	await assert.rejects(client.organizations.list(), (error: unknown) => error instanceof ApiError && error.isNetworkError);
	assert.equal(client.http.hasAccessToken(), true);
	assert.equal(expired.length, 0);
});

test("restore returns null when there is no session and the user when the cookie is valid", async () => {
	const none = setup(() => json(401, { error: { code: "AUTHENTICATION_REQUIRED", message: "no" } }));
	assert.equal(await none.client.auth.restore(), null);

	const valid = setup((call) => (refresh(call) ? json(200, { data: { accessToken: "t", expiresIn: 900 } }) : json(200, { data: { user } })));
	assert.deepEqual(await valid.client.auth.restore(), user);
});

test("API errors keep their code, details and request id", async () => {
	const { client } = setup(() =>
		json(400, { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: { fields: { email: ["Invalid"] } }, requestId: "req-1" } }),
	);
	await assert.rejects(client.auth.register({ email: "x", password: "y" }), (error: unknown) => {
		assert.ok(error instanceof ApiError);
		assert.equal(error.status, 400);
		assert.equal(error.code, "VALIDATION_ERROR");
		assert.equal(error.requestId, "req-1");
		assert.deepEqual(error.details, { fields: { email: ["Invalid"] } });
		return true;
	});
});

test("unauthenticated endpoints never send a token or trigger a refresh", async () => {
	const { client, calls } = setup(() => json(200, { data: { user, verificationRequired: true } }));
	await client.auth.register({ email: "a@example.com", password: "long-enough-password" });
	assert.equal(calls.length, 1);
	assert.equal(calls[0]?.headers.Authorization, undefined);
});

test("empty and malformed responses are handled", async () => {
	const empty = setup((call) => (login(call) ? json(200, { data: { user, accessToken: "t", expiresIn: 900 } }) : new Response(null, { status: 204 })));
	await empty.client.auth.login({ email: "a@example.com", password: "pw" });
	assert.equal(await empty.client.http.delete("/anything"), undefined);

	const bad = setup(() => new Response("<html>oops</html>", { status: 502 }));
	await assert.rejects(bad.client.auth.register({ email: "a@example.com", password: "pw" }), (error: unknown) => error instanceof ApiError && error.status === 502 && error.code === "UNKNOWN_ERROR");
});

test("query values are encoded and empty ones are dropped", async () => {
	const { client, calls } = setup(() => json(200, { data: {} }));
	await client.http.get("/things", { auth: false, query: { q: "a b&c", limit: 5, empty: undefined, none: null } });
	assert.equal(calls[0]?.url, "https://api.test/api/v1/things?q=a+b%26c&limit=5");
});

test("custom headers are added to every request", async () => {
	const { client, calls } = setup(() => json(200, { data: { organizations: [] } }), { headers: () => ({ "X-Client": "mobile" }) });
	await client.http.get("/organizations", { auth: false });
	assert.equal(calls[0]?.headers["X-Client"], "mobile");
});

test("field errors are read from validation details", () => {
	const error = new ApiError({
		status: 400,
		code: "VALIDATION_ERROR",
		message: "Request validation failed",
		details: { issues: [{ path: "email", message: "Invalid email" }, { path: "email", message: "Second" }, { path: "password", message: "Too short" }] },
	});
	assert.deepEqual(fieldErrors(error), { email: "Invalid email", password: "Too short" });
	assert.deepEqual(fieldErrors(new Error("x")), {});
	assert.deepEqual(fieldErrors(new ApiError({ status: 500, code: "X", message: "x" })), {});
});
