import assert from "node:assert/strict";
import { test } from "node:test";

import { AuthenticationError, ConflictError, EmailNotVerifiedError, ForbiddenError, ValidationError } from "../src/foundation/errors/app-error.js";
import type { AuthUserRecord } from "../src/modules/auth/repositories/auth.repository.interface.js";
import { ChangePasswordUseCase } from "../src/modules/auth/usecases/change-password.usecase.js";
import { LoginUseCase } from "../src/modules/auth/usecases/login.usecase.js";
import { RegisterUseCase } from "../src/modules/auth/usecases/register.usecase.js";
import { ResetPasswordUseCase } from "../src/modules/auth/usecases/reset-password.usecase.js";
import { SendAuthTokenUseCase } from "../src/modules/auth/usecases/send-auth-token.usecase.js";
import { VerifyEmailUseCase } from "../src/modules/auth/usecases/verify-email.usecase.js";
import { auditSpy, authRepository, emailSpy } from "./helpers.js";

function user(overrides: Partial<AuthUserRecord> = {}): AuthUserRecord {
	return {
		id: "user-1",
		email: "user@example.com",
		displayName: "User",
		emailVerifiedAt: new Date(),
		passwordHash: "stored-hash",
		disabledAt: null,
		...overrides,
	};
}

function loginDeps(overrides: { user?: AuthUserRecord | null; verifies?: boolean; needsRehash?: boolean } = {}) {
	const calls = { created: 0, burned: 0, loggedIn: 0, rehashed: 0 };
	const audit = auditSpy();
	const found = overrides.user === undefined ? user() : overrides.user;
	const useCase = new LoginUseCase({
		authRepository: authRepository({
			findByEmail: async () => found,
			markLoggedIn: async () => { calls.loggedIn += 1; },
			updatePasswordHash: async () => { calls.rehashed += 1; },
		}),
		passwordService: {
			verify: async () => overrides.verifies ?? true,
			burn: async () => { calls.burned += 1; },
			needsRehash: () => overrides.needsRehash ?? false,
			hash: async () => "new-hash",
		} as never,
		sessionService: {
			create: async () => {
				calls.created += 1;
				return { accessToken: "access", refreshToken: "refresh", expiresIn: 900, refreshExpiresAt: new Date() };
			},
		} as never,
		auditService: audit,
	});
	return { useCase, calls, audit };
}

test("login for an unknown account burns hashing time and creates no session", async () => {
	const { useCase, calls } = loginDeps({ user: null });
	await assert.rejects(useCase.execute({ email: "nobody@example.com", password: "password" }), AuthenticationError);
	assert.equal(calls.burned, 1);
	assert.equal(calls.created, 0);
});

test("login with a wrong password is audited and creates no session", async () => {
	const { useCase, calls, audit } = loginDeps({ verifies: false });
	await assert.rejects(useCase.execute({ email: "user@example.com", password: "wrong" }), AuthenticationError);
	assert.equal(calls.created, 0);
	assert.deepEqual(audit.events.map((event) => event.action), ["auth.login.failed"]);
});

test("login refuses disabled accounts after the password check", async () => {
	const { useCase, calls, audit } = loginDeps({ user: user({ disabledAt: new Date() }) });
	await assert.rejects(useCase.execute({ email: "user@example.com", password: "right" }), ForbiddenError);
	assert.equal(calls.created, 0);
	assert.equal(audit.events[0]?.action, "auth.login.blocked");
});

test("login requires a verified email", async () => {
	const { useCase, calls } = loginDeps({ user: user({ emailVerifiedAt: null }) });
	await assert.rejects(useCase.execute({ email: "user@example.com", password: "right" }), EmailNotVerifiedError);
	assert.equal(calls.created, 0);
});

test("successful login returns a public user, records the login and never leaks the hash", async () => {
	const { useCase, calls, audit } = loginDeps();
	const result = await useCase.execute({ email: "user@example.com", password: "right" });
	assert.equal(calls.created, 1);
	assert.equal(calls.loggedIn, 1);
	assert.equal(calls.rehashed, 0);
	assert.equal("passwordHash" in result.user, false);
	assert.equal(result.accessToken, "access");
	assert.equal(audit.events[0]?.action, "auth.login.success");
});

test("login upgrades outdated password hashes", async () => {
	const { useCase, calls } = loginDeps({ needsRehash: true });
	await useCase.execute({ email: "user@example.com", password: "right" });
	assert.equal(calls.rehashed, 1);
});

test("registration succeeds even when the verification email cannot be queued", async () => {
	const email = emailSpy();
	email.sendVerification = async () => { throw new Error("queue closed"); };
	const useCase = new RegisterUseCase({
		authRepository: authRepository({
			register: async (input) => ({ id: "user-2", email: input.email, displayName: null, emailVerifiedAt: null }),
		}),
		passwordService: { hash: async () => "hash" } as never,
		tokenService: { generate: () => "token", hash: () => "token-hash" } as never,
		authEmailService: email,
		auditService: auditSpy(),
	});
	const result = await useCase.execute({ email: "new@example.com", password: "a-long-secure-password" });
	assert.equal(result.verificationRequired, true);
	assert.equal(result.user.email, "new@example.com");
});

test("registration maps duplicate emails and unique violations to conflicts", async () => {
	const shared = {
		passwordService: { hash: async () => "hash" } as never,
		tokenService: { generate: () => "token", hash: () => "token-hash" } as never,
		authEmailService: emailSpy(),
		auditService: auditSpy(),
	};
	const existing = new RegisterUseCase({ ...shared, authRepository: authRepository({ findByEmail: async () => user() }) });
	await assert.rejects(existing.execute({ email: "user@example.com", password: "a-long-secure-password" }), ConflictError);

	const raced = new RegisterUseCase({
		...shared,
		authRepository: authRepository({ register: async () => { throw Object.assign(new Error("duplicate"), { code: "P2002" }); } }),
	});
	await assert.rejects(raced.execute({ email: "user@example.com", password: "a-long-secure-password" }), ConflictError);
});

test("verification rejects expired tokens without consuming them", async () => {
	let consumed = false;
	const useCase = new VerifyEmailUseCase({
		authRepository: authRepository({
			findToken: async () => ({
				id: "token-1", userId: "user-1", type: "EMAIL_VERIFICATION",
				consumedAt: null, expiresAt: new Date(0), createdAt: new Date(0),
			}),
			consumeVerification: async () => { consumed = true; return true; },
		}),
		tokenService: { hash: () => "hash" } as never,
		auditService: auditSpy(),
	});
	await assert.rejects(useCase.execute("expired-token"), ValidationError);
	assert.equal(consumed, false);
});

test("verification rejects tokens of the wrong type", async () => {
	const useCase = new VerifyEmailUseCase({
		authRepository: authRepository({
			findToken: async () => ({
				id: "token-1", userId: "user-1", type: "PASSWORD_RESET",
				consumedAt: null, expiresAt: new Date(Date.now() + 60000), createdAt: new Date(),
			}),
		}),
		tokenService: { hash: () => "hash" } as never,
		auditService: auditSpy(),
	});
	await assert.rejects(useCase.execute("reset-token"), ValidationError);
});

test("reset rejects consumed tokens without hashing passwords", async () => {
	let hashed = false;
	const useCase = new ResetPasswordUseCase({
		authRepository: authRepository({
			findToken: async () => ({
				id: "token-1", userId: "user-1", type: "PASSWORD_RESET",
				consumedAt: new Date(), expiresAt: new Date(Date.now() + 60000), createdAt: new Date(),
			}),
		}),
		passwordService: { hash: async () => { hashed = true; return "hash"; } } as never,
		tokenService: { hash: () => "hash" } as never,
		authEmailService: emailSpy(),
		auditService: auditSpy(),
	});
	await assert.rejects(useCase.execute("used-token", "a-long-secure-password"), ValidationError);
	assert.equal(hashed, false);
});

test("a successful reset audits the change and notifies the owner", async () => {
	const email = emailSpy();
	const audit = auditSpy();
	const useCase = new ResetPasswordUseCase({
		authRepository: authRepository({
			findToken: async () => ({
				id: "token-1", userId: "user-1", type: "PASSWORD_RESET",
				consumedAt: null, expiresAt: new Date(Date.now() + 60000), createdAt: new Date(),
			}),
			resetPassword: async () => true,
			findById: async () => user(),
		}),
		passwordService: { hash: async () => "hash" } as never,
		tokenService: { hash: () => "hash" } as never,
		authEmailService: email,
		auditService: audit,
	});
	assert.deepEqual(await useCase.execute("good-token", "a-long-secure-password"), { reset: true });
	assert.deepEqual(email.sent, [{ kind: "changed", email: "user@example.com" }]);
	assert.equal(audit.events[0]?.action, "auth.password.reset");
});

function sendTokenDeps(found: AuthUserRecord | null, latestCreatedAt?: Date) {
	const email = emailSpy();
	let replaced = 0;
	const useCase = new SendAuthTokenUseCase({
		authRepository: authRepository({
			findByEmail: async () => found,
			findLatestToken: async () => latestCreatedAt
				? { id: "t", userId: "user-1", type: "PASSWORD_RESET", consumedAt: null, expiresAt: new Date(), createdAt: latestCreatedAt }
				: null,
			replaceToken: async () => { replaced += 1; },
		}),
		authEmailService: email,
		tokenService: { generate: () => "token", hash: () => "hash" } as never,
		auditService: auditSpy(),
	});
	return { useCase, email, replaced: () => replaced };
}

test("forgot-password answers identically and sends nothing for unknown or disabled accounts", async () => {
	for (const found of [null, user({ disabledAt: new Date() }), user({ passwordHash: null })]) {
		const { useCase, email, replaced } = sendTokenDeps(found);
		assert.deepEqual(await useCase.execute("someone@example.com", "reset"), { accepted: true });
		assert.equal(email.sent.length, 0);
		assert.equal(replaced(), 0);
	}
});

test("forgot-password sends a reset email for real accounts", async () => {
	const { useCase, email, replaced } = sendTokenDeps(user());
	assert.deepEqual(await useCase.execute("user@example.com", "reset"), { accepted: true });
	assert.deepEqual(email.sent, [{ kind: "reset", email: "user@example.com", token: "token" }]);
	assert.equal(replaced(), 1);
});

test("token requests inside the cooldown are accepted silently without a new email", async () => {
	const { useCase, email, replaced } = sendTokenDeps(user(), new Date());
	assert.deepEqual(await useCase.execute("user@example.com", "reset"), { accepted: true });
	assert.equal(email.sent.length, 0);
	assert.equal(replaced(), 0);
});

test("resend-verification skips accounts that are already verified", async () => {
	const { useCase, email } = sendTokenDeps(user());
	assert.deepEqual(await useCase.execute("user@example.com", "verify"), { accepted: true });
	assert.equal(email.sent.length, 0);
});

test("change-password rejects a wrong current password and changes nothing", async () => {
	let changed = false;
	const audit = auditSpy();
	const useCase = new ChangePasswordUseCase({
		authRepository: authRepository({
			findById: async () => user(),
			changePassword: async () => { changed = true; },
		}),
		passwordService: { verify: async () => false, hash: async () => "hash" } as never,
		authEmailService: emailSpy(),
		auditService: audit,
	});
	await assert.rejects(
		useCase.execute({ userId: "user-1", sessionId: "s1", currentPassword: "wrong", newPassword: "a-long-secure-password" }),
		ValidationError,
	);
	assert.equal(changed, false);
	assert.equal(audit.events[0]?.action, "auth.password.change_failed");
});

test("change-password keeps only the current session and notifies the owner", async () => {
	const email = emailSpy();
	let kept: string | undefined;
	const useCase = new ChangePasswordUseCase({
		authRepository: authRepository({
			findById: async () => user(),
			changePassword: async (_userId, _hash, keepSessionId) => { kept = keepSessionId; },
		}),
		passwordService: { verify: async () => true, hash: async () => "hash" } as never,
		authEmailService: email,
		auditService: auditSpy(),
	});
	assert.deepEqual(
		await useCase.execute({ userId: "user-1", sessionId: "session-9", currentPassword: "old", newPassword: "a-long-secure-password" }),
		{ changed: true },
	);
	assert.equal(kept, "session-9");
	assert.deepEqual(email.sent, [{ kind: "changed", email: "user@example.com" }]);
});
