import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInput } from "../src/foundation/validation/validate.js";
import { registerSchema } from "../src/modules/auth/validators/auth.validator.js";
import { PasswordService } from "../src/modules/auth/services/password.service.js";

test("registration normalizes email and display name", () => {
	const result = parseInput(registerSchema, {
		email: "  Example.User@EXAMPLE.COM  ",
		password: "a-very-long-password",
		displayName: "  Support User  ",
	});
	assert.equal(result.email, "example.user@example.com");
	assert.equal(result.displayName, "Support User");
});

test("registration rejects weak passwords and unexpected fields", () => {
	assert.throws(() => parseInput(registerSchema, { email: "valid@example.com", password: "short" }));
	assert.throws(() => parseInput(registerSchema, {
		email: "valid@example.com",
		password: "a-very-long-password",
		isAdmin: true,
	}));
});

test("argon2id hashes and verifies passwords without storing plaintext", async () => {
	const service = new PasswordService();
	const password = "a-very-long-password";
	const hash = await service.hash(password);
	assert.match(hash, /^\$argon2id\$/);
	assert.notEqual(hash, password);
	assert.equal(await service.verify(hash, password), true);
	assert.equal(await service.verify(hash, "wrong-password"), false);
	assert.equal(await service.verify("invalid-hash", password), false);
});
