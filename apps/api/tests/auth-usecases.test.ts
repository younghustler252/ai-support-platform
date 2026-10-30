import assert from "node:assert/strict";
import { test } from "node:test";
import { LoginUseCase } from "../src/modules/auth/usecases/login.usecase.js";
import { VerifyEmailUseCase } from "../src/modules/auth/usecases/verify-email.usecase.js";
import { ResetPasswordUseCase } from "../src/modules/auth/usecases/reset-password.usecase.js";
import { SendAuthTokenUseCase } from "../src/modules/auth/usecases/send-auth-token.usecase.js";
import type { IAuthRepository } from "../src/modules/auth/repositories/auth.repository.interface.js";

function repository(overrides: Partial<IAuthRepository> = {}): IAuthRepository {
	return {
		findByEmail: async () => null,
		findToken: async () => null,
		register: async () => { throw new Error("unexpected register"); },
		consumeVerification: async () => false,
		replaceToken: async () => { throw new Error("unexpected replaceToken"); },
		resetPassword: async () => false,
		...overrides,
	};
}

test("login rejects an unknown account without creating a session", async () => {
	let created = false;
	const useCase = new LoginUseCase({
		authRepository: repository(),
		passwordService: { verify: async () => false } as never,
		sessionService: { create: async () => { created = true; } } as never,
	});
	await assert.rejects(useCase.execute("unknown@example.com", "password"));
	assert.equal(created, false);
});

test("verification rejects expired tokens without consuming them", async () => {
	let consumed = false;
	const useCase = new VerifyEmailUseCase({
		authRepository: repository({
			findToken: async () => ({
				id: "token-1", userId: "user-1", type: "EMAIL_VERIFICATION",
				consumedAt: null, expiresAt: new Date(0),
			}),
			consumeVerification: async () => { consumed = true; return true; },
		}),
		tokenService: { hash: () => "hash" } as never,
	});
	await assert.rejects(useCase.execute("expired-token"));
	assert.equal(consumed, false);
});

test("reset rejects already consumed tokens without hashing passwords", async () => {
	let hashed = false;
	const useCase = new ResetPasswordUseCase({
		authRepository: repository({
			findToken: async () => ({
				id: "token-1", userId: "user-1", type: "PASSWORD_RESET",
				consumedAt: new Date(), expiresAt: new Date(Date.now() + 60000),
			}),
		}),
		passwordService: { hash: async () => { hashed = true; return "hash"; } } as never,
		tokenService: { hash: () => "hash" } as never,
	});
	await assert.rejects(useCase.execute("used-token", "a-long-secure-password"));
	assert.equal(hashed, false);
});

test("forgot-password does not reveal whether an account exists", async () => {
	let sent = false;
	const useCase = new SendAuthTokenUseCase({
		authRepository: repository(),
		authEmailService: { send: async () => { sent = true; } },
		tokenService: { generate: () => "token", hash: () => "hash" } as never,
	});
	assert.deepEqual(await useCase.execute("unknown@example.com", "reset"), { accepted: true });
	assert.equal(sent, false);
});
