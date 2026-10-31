import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { asClass, asValue, createContainer, InjectionMode } from "awilix";

import { authConfig } from "../src/config/auth.js";
import { AuthenticationError, RefreshConflictError } from "../src/foundation/errors/app-error.js";
import { errorHandler } from "../src/foundation/middleware/error-handler.js";
import { requestScope } from "../src/foundation/middleware/request-scope.js";
import { MemoryRateLimiter } from "../src/foundation/rate-limit/rate-limiter.js";
import { AuthController } from "../src/modules/auth/controllers/auth.controller.js";
import { authRouter } from "../src/modules/auth/routes/auth.routes.js";
import { withServer } from "./helpers.js";

const identity = {
	user: { id: "user-1", email: "user@example.com", displayName: "User", emailVerifiedAt: new Date() },
	sessionId: "session-1",
};
const session = {
	accessToken: "access-token-value",
	refreshToken: "refresh-token-value",
	expiresIn: authConfig.accessTtlSeconds,
	refreshExpiresAt: new Date(Date.now() + 86_400_000),
};
const validToken = "A".repeat(43);
const trustedOrigin = "http://localhost:3000";
const cookieName = authConfig.cookie.name;

type Overrides = Record<string, unknown>;

function buildApp(overrides: Overrides = {}) {
	const recorded: Record<string, unknown[][]> = {};
	const spy = (name: string, result: unknown) => ({
		execute: async (...args: unknown[]) => {
			(recorded[name] ??= []).push(args);
			if (result instanceof Error) throw result;
			return result;
		},
	});

	const container = createContainer({ injectionMode: InjectionMode.PROXY, strict: true });
	container.register({
		rateLimiter: asValue(new MemoryRateLimiter()),
		authController: asClass(AuthController).scoped(),
		registerUseCase: asValue(spy("register", { user: identity.user, verificationRequired: true })),
		verifyEmailUseCase: asValue(spy("verifyEmail", { verified: true })),
		sendAuthTokenUseCase: asValue(spy("sendAuthToken", { accepted: true })),
		resetPasswordUseCase: asValue(spy("resetPassword", { reset: true })),
		loginUseCase: asValue(spy("login", { user: identity.user, ...session })),
		refreshTokenUseCase: asValue(spy("refresh", session)),
		logoutUseCase: asValue(spy("logout", { loggedOut: true })),
		logoutAllUseCase: asValue(spy("logoutAll", { loggedOut: true })),
		changePasswordUseCase: asValue(spy("changePassword", { changed: true })),
		listSessionsUseCase: asValue(spy("listSessions", [])),
		revokeSessionUseCase: asValue(spy("revokeSession", { revoked: true, current: false })),
		getCurrentUserUseCase: asValue(spy("authenticate", identity)),
		...Object.fromEntries(
			Object.entries(overrides).map(([name, result]) => [name, asValue(spy(name, result))]),
		),
	});

	const app = express();
	app.use(requestScope(container));
	app.use(express.json({ limit: "64kb" }));
	app.use("/api/v1/auth", authRouter());
	app.use(errorHandler);
	return { app, recorded };
}

function post(baseUrl: string, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) {
	return fetch(`${baseUrl}/api/v1/auth${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...init.headers },
		body: JSON.stringify(init.body ?? {}),
	});
}

test("login sets an httpOnly scoped refresh cookie and keeps the refresh token out of the body", async () => {
	const { app } = buildApp();
	await withServer(app, async (baseUrl) => {
		const response = await post(baseUrl, "/login", {
			body: { email: "User@Example.com", password: "whatever" },
			headers: { Origin: trustedOrigin },
		});
		assert.equal(response.status, 200);
		assert.equal(response.headers.get("cache-control"), "no-store");

		const cookie = response.headers.getSetCookie().find((value) => value.startsWith(`${cookieName}=`));
		assert.ok(cookie, "refresh cookie missing");
		assert.match(cookie, /HttpOnly/i);
		assert.match(cookie, /Path=\/api\/v1\/auth/);
		assert.match(cookie, /SameSite=Lax/i);
		assert.ok(cookie.includes("refresh-token-value"));

		const raw = await response.text();
		assert.doesNotMatch(raw, /refresh-token-value/);
		const body = JSON.parse(raw) as { data: { accessToken: string; user: { email: string } } };
		assert.equal(body.data.accessToken, "access-token-value");
	});
});

test("login validates the body and normalises the email before the use case runs", async () => {
	const { app, recorded } = buildApp();
	await withServer(app, async (baseUrl) => {
		const invalid = await post(baseUrl, "/login", { body: { email: "nope", password: "x" } });
		assert.equal(invalid.status, 400);
		assert.equal(recorded.login, undefined);

		await post(baseUrl, "/login", { body: { email: "  User@Example.COM ", password: "x" } });
		const [input] = recorded.login?.[0] ?? [];
		assert.deepEqual(input, { email: "user@example.com", password: "x" });
	});
});

test("cookie-based endpoints reject untrusted origins", async () => {
	const { app, recorded } = buildApp();
	await withServer(app, async (baseUrl) => {
		for (const path of ["/login", "/refresh", "/logout"]) {
			const response = await post(baseUrl, path, {
				body: path === "/login" ? { email: "user@example.com", password: "x" } : {},
				headers: { Origin: "https://evil.example.com", Cookie: `${cookieName}=abc` },
			});
			assert.equal(response.status, 403, path);
		}
		assert.equal(recorded.login, undefined);
		assert.equal(recorded.refresh, undefined);
		assert.equal(recorded.logout, undefined);
	});
});

test("refresh without a cookie is unauthenticated", async () => {
	const { app, recorded } = buildApp();
	await withServer(app, async (baseUrl) => {
		const response = await post(baseUrl, "/refresh", { headers: { Origin: trustedOrigin } });
		assert.equal(response.status, 401);
		assert.equal(recorded.refresh, undefined);
	});
});

test("refresh rotates the cookie and returns a new access token", async () => {
	const { app, recorded } = buildApp();
	await withServer(app, async (baseUrl) => {
		const response = await post(baseUrl, "/refresh", {
			headers: { Origin: trustedOrigin, Cookie: `other=1; ${cookieName}=old-token; theme=dark` },
		});
		assert.equal(response.status, 200);
		assert.equal(recorded.refresh?.[0]?.[0], "old-token");
		assert.ok(response.headers.getSetCookie().some((value) => value.startsWith(`${cookieName}=refresh-token-value`)));
	});
});

test("a failed refresh clears the cookie but a rotation conflict keeps it", async () => {
	const rejected = buildApp({ refreshTokenUseCase: new AuthenticationError("Invalid refresh token") });
	await withServer(rejected.app, async (baseUrl) => {
		const response = await post(baseUrl, "/refresh", { headers: { Origin: trustedOrigin, Cookie: `${cookieName}=bad` } });
		assert.equal(response.status, 401);
		const cleared = response.headers.getSetCookie().find((value) => value.startsWith(`${cookieName}=`));
		assert.ok(cleared, "cookie should be cleared");
		assert.match(cleared, /Expires=Thu, 01 Jan 1970/);
	});

	const conflicted = buildApp({ refreshTokenUseCase: new RefreshConflictError() });
	await withServer(conflicted.app, async (baseUrl) => {
		const response = await post(baseUrl, "/refresh", { headers: { Origin: trustedOrigin, Cookie: `${cookieName}=racing` } });
		assert.equal(response.status, 409);
		assert.equal(response.headers.getSetCookie().length, 0);
		assert.equal(((await response.json()) as { error: { code: string } }).error.code, "REFRESH_CONFLICT");
	});
});

test("logout always clears the cookie and only revokes when a token exists", async () => {
	const { app, recorded } = buildApp();
	await withServer(app, async (baseUrl) => {
		const withoutCookie = await post(baseUrl, "/logout", { headers: { Origin: trustedOrigin } });
		assert.equal(withoutCookie.status, 200);
		assert.equal(recorded.logout, undefined);
		assert.ok(withoutCookie.headers.getSetCookie().some((value) => value.startsWith(`${cookieName}=`)));

		const withCookie = await post(baseUrl, "/logout", { headers: { Origin: trustedOrigin, Cookie: `${cookieName}=live-token` } });
		assert.equal(withCookie.status, 200);
		assert.equal(recorded.logout?.[0]?.[0], "live-token");
	});
});

test("protected endpoints require a valid access token and expose the user", async () => {
	const denied = buildApp({ getCurrentUserUseCase: new AuthenticationError() });
	await withServer(denied.app, async (baseUrl) => {
		const response = await fetch(`${baseUrl}/api/v1/auth/me`);
		assert.equal(response.status, 401);
		assert.equal(((await response.json()) as { error: { code: string } }).error.code, "UNAUTHENTICATED");
	});

	const allowed = buildApp();
	await withServer(allowed.app, async (baseUrl) => {
		const response = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { Authorization: "Bearer anything" } });
		assert.equal(response.status, 200);
		const body = await response.json() as { data: { user: { id: string } } };
		assert.equal(body.data.user.id, "user-1");
		assert.equal(allowed.recorded.authenticate?.[0]?.[0], "Bearer anything");
	});
});

test("change-password validates input and passes the current session to the use case", async () => {
	const { app, recorded } = buildApp();
	await withServer(app, async (baseUrl) => {
		const headers = { Authorization: "Bearer anything" };

		const same = await post(baseUrl, "/change-password", {
			headers,
			body: { currentPassword: "same-long-password-1", newPassword: "same-long-password-1" },
		});
		assert.equal(same.status, 400);

		const ok = await post(baseUrl, "/change-password", {
			headers,
			body: { currentPassword: "old-password-value", newPassword: "brand-new-password-1" },
		});
		assert.equal(ok.status, 200);
		assert.deepEqual(recorded.changePassword?.[0]?.[0], {
			userId: "user-1",
			sessionId: "session-1",
			currentPassword: "old-password-value",
			newPassword: "brand-new-password-1",
		});
	});
});

test("session management requires a uuid and clears the cookie when the current session is revoked", async () => {
	const { app } = buildApp({ revokeSessionUseCase: { revoked: true, current: true } });
	await withServer(app, async (baseUrl) => {
		const headers = { Authorization: "Bearer anything" };

		const invalid = await fetch(`${baseUrl}/api/v1/auth/sessions/not-a-uuid`, { method: "DELETE", headers });
		assert.equal(invalid.status, 400);

		const revoked = await fetch(`${baseUrl}/api/v1/auth/sessions/6f1c8c9e-8f0a-4b8e-9f43-0c3f6a2d9b11`, { method: "DELETE", headers });
		assert.equal(revoked.status, 200);
		assert.ok(revoked.headers.getSetCookie().some((value) => value.startsWith(`${cookieName}=`)));

		const listed = await fetch(`${baseUrl}/api/v1/auth/sessions`, { headers });
		assert.equal(listed.status, 200);
	});
});

test("token submission endpoints reject malformed tokens before any lookup", async () => {
	const { app, recorded } = buildApp();
	await withServer(app, async (baseUrl) => {
		assert.equal((await post(baseUrl, "/verify-email", { body: { token: "short" } })).status, 400);
		assert.equal((await post(baseUrl, "/reset-password", { body: { token: "short", password: "a-long-secure-password" } })).status, 400);
		assert.equal(recorded.verifyEmail, undefined);
		assert.equal(recorded.resetPassword, undefined);

		assert.equal((await post(baseUrl, "/verify-email", { body: { token: validToken } })).status, 200);
	});
});

test("forgot-password is throttled per email address", async () => {
	const { app } = buildApp();
	await withServer(app, async (baseUrl) => {
		const statuses: number[] = [];
		for (let attempt = 0; attempt < authConfig.rateLimits.tokenRequestEmail.limit + 1; attempt += 1) {
			statuses.push((await post(baseUrl, "/forgot-password", { body: { email: "victim@example.com" } })).status);
		}
		const limit = authConfig.rateLimits.tokenRequestEmail.limit;
		assert.deepEqual(statuses.slice(0, limit), Array(limit).fill(202));
		assert.equal(statuses[limit], 429);

		const other = await post(baseUrl, "/forgot-password", { body: { email: "someone-else@example.com" } });
		assert.equal(other.status, 202);
	});
});

test("login attempts for one account are throttled", async () => {
	const { app } = buildApp();
	await withServer(app, async (baseUrl) => {
		const limit = authConfig.rateLimits.loginAccount.limit;
		let last = 0;
		for (let attempt = 0; attempt <= limit; attempt += 1) {
			last = (await post(baseUrl, "/login", {
				body: { email: "target@example.com", password: "guess" },
				headers: { Origin: trustedOrigin },
			})).status;
		}
		assert.equal(last, 429);
	});
});

test("malformed JSON on auth routes is a 400 with a request id", async () => {
	const { app } = buildApp();
	await withServer(app, async (baseUrl) => {
		const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: trustedOrigin },
			body: "{ nope",
		});
		assert.equal(response.status, 400);
		const body = await response.json() as { error: { requestId?: string } };
		assert.equal(body.error.requestId, response.headers.get("x-request-id"));
	});
});
