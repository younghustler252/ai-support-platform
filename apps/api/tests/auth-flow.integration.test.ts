import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { asValue } from "awilix";

import { authConfig } from "../src/config/auth.js";
import { auditSpy, emailSpy } from "./helpers.js";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const skip = enabled ? false : "set TEST_DATABASE_URL to a migrated Postgres database to run";
const password = "correct-horse-battery-staple";
const email = `flow-${randomUUID()}@example.com`;
const origin = "http://localhost:3000";

type Prisma = typeof import("../src/infrastructure/database/prisma.js")["prisma"];

let baseUrl = "";
let prisma: Prisma;
let closeServer: () => Promise<void> = async () => {};
const mailbox = emailSpy();

function cookieFrom(response: Response): string {
	const header = response.headers.getSetCookie().find((value) => value.startsWith(`${authConfig.cookie.name}=`));
	assert.ok(header, "expected a refresh cookie");
	return header.split(";")[0] as string;
}

function api(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
	return fetch(`${baseUrl}/api/v1/auth${path}`, {
		method: init.method ?? "POST",
		headers: { "Content-Type": "application/json", Origin: origin, ...init.headers },
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
}

before(async () => {
	if (!enabled) return;
	const { container } = await import("../src/container/index.js");
	const { createApp } = await import("../src/app.js");
	({ prisma } = await import("../src/infrastructure/database/prisma.js"));

	container.register({ authEmailService: asValue(mailbox), auditService: asValue(auditSpy()) });

	const server = createServer(createApp());
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("No TCP port");
	baseUrl = `http://127.0.0.1:${address.port}`;
	closeServer = async () => {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	};
});

after(async () => {
	if (!enabled) return;
	await prisma.user.deleteMany({ where: { email } });
	await closeServer();
	await prisma.$disconnect();
});

test("full account lifecycle against Postgres", { skip }, async () => {
	const registered = await api("/register", { body: { email, password, displayName: "Flow Tester" } });
	assert.equal(registered.status, 201);
	const verifyToken = mailbox.sent.find((item) => item.kind === "verify" && item.email === email)?.token;
	assert.ok(verifyToken, "verification email not sent");

	const duplicate = await api("/register", { body: { email, password } });
	assert.equal(duplicate.status, 409);

	const early = await api("/login", { body: { email, password } });
	assert.equal(early.status, 403);
	assert.equal(((await early.json()) as { error: { code: string } }).error.code, "EMAIL_NOT_VERIFIED");

	assert.equal((await api("/verify-email", { body: { token: verifyToken } })).status, 200);
	assert.equal((await api("/verify-email", { body: { token: verifyToken } })).status, 400);

	assert.equal((await api("/login", { body: { email, password: "wrong-password-value" } })).status, 401);

	const login = await api("/login", { body: { email, password } });
	assert.equal(login.status, 200);
	const firstCookie = cookieFrom(login);
	const { data: loginData } = await login.json() as { data: { accessToken: string } };

	const me = await api("/me", { method: "GET", headers: { Authorization: `Bearer ${loginData.accessToken}` } });
	assert.equal(me.status, 200);

	const refreshed = await api("/refresh", { headers: { Cookie: firstCookie } });
	assert.equal(refreshed.status, 200);
	const secondCookie = cookieFrom(refreshed);
	assert.notEqual(secondCookie, firstCookie);

	const concurrent = await api("/refresh", { headers: { Cookie: firstCookie } });
	assert.equal(concurrent.status, 409);

	await prisma.authSession.updateMany({
		where: { user: { email }, revokedReason: "ROTATED" },
		data: { revokedAt: new Date(Date.now() - authConfig.refreshGraceMs - 60_000) },
	});
	const replay = await api("/refresh", { headers: { Cookie: firstCookie } });
	assert.equal(replay.status, 401);

	const afterReplay = await api("/refresh", { headers: { Cookie: secondCookie } });
	assert.equal(afterReplay.status, 401);

	const relogin = await api("/login", { body: { email, password } });
	assert.equal(relogin.status, 200);
	const { data: reloginData } = await relogin.json() as { data: { accessToken: string } };
	const bearer = { Authorization: `Bearer ${reloginData.accessToken}` };

	const sessions = await api("/sessions", { method: "GET", headers: bearer });
	const listed = await sessions.json() as { data: { sessions: Array<{ id: string; current: boolean }> } };
	assert.equal(listed.data.sessions.filter((item) => item.current).length, 1);

	const newPassword = "another-long-secure-passphrase";
	const wrongCurrent = await api("/change-password", { headers: bearer, body: { currentPassword: "not-my-password", newPassword } });
	assert.equal(wrongCurrent.status, 400);
	const changed = await api("/change-password", { headers: bearer, body: { currentPassword: password, newPassword } });
	assert.equal(changed.status, 200);
	assert.equal((await api("/me", { method: "GET", headers: bearer })).status, 200);
	assert.equal((await api("/login", { body: { email, password } })).status, 401);

	assert.equal((await api("/forgot-password", { body: { email } })).status, 202);
	const resetToken = mailbox.sent.find((item) => item.kind === "reset" && item.email === email)?.token;
	assert.ok(resetToken, "reset email not sent");
	const resetPassword = "final-long-secure-passphrase";
	assert.equal((await api("/reset-password", { body: { token: resetToken, password: resetPassword } })).status, 200);
	assert.equal((await api("/reset-password", { body: { token: resetToken, password: resetPassword } })).status, 400);
	assert.equal((await api("/me", { method: "GET", headers: bearer })).status, 401);

	const finalLogin = await api("/login", { body: { email, password: resetPassword } });
	assert.equal(finalLogin.status, 200);
	const finalCookie = cookieFrom(finalLogin);
	assert.equal((await api("/logout", { headers: { Cookie: finalCookie } })).status, 200);
	assert.equal((await api("/refresh", { headers: { Cookie: finalCookie } })).status, 401);
});

test("disabled users cannot log in or refresh", { skip }, async () => {
	const disabledEmail = `disabled-${randomUUID()}@example.com`;
	try {
		assert.equal((await api("/register", { body: { email: disabledEmail, password } })).status, 201);
		const token = mailbox.sent.find((item) => item.kind === "verify" && item.email === disabledEmail)?.token;
		assert.ok(token);
		assert.equal((await api("/verify-email", { body: { token } })).status, 200);

		const login = await api("/login", { body: { email: disabledEmail, password } });
		assert.equal(login.status, 200);
		const cookie = cookieFrom(login);

		await prisma.user.update({ where: { email: disabledEmail }, data: { disabledAt: new Date() } });

		assert.equal((await api("/refresh", { headers: { Cookie: cookie } })).status, 401);
		assert.equal((await api("/login", { body: { email: disabledEmail, password } })).status, 403);
	} finally {
		await prisma.user.deleteMany({ where: { email: disabledEmail } });
	}
});
