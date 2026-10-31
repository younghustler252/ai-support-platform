import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { SignJWT } from "jose";

import { authConfig } from "../src/config/auth.js";
import { AuthenticationError, RefreshConflictError } from "../src/foundation/errors/app-error.js";
import type { SessionRevokeReason } from "../src/modules/auth/auth.types.js";
import type { ISessionRepository, SessionLookup } from "../src/modules/auth/repositories/session.repository.js";
import { SessionService } from "../src/modules/auth/services/session.service.js";
import { TokenService } from "../src/modules/auth/services/token.service.js";
import { auditSpy } from "./helpers.js";

function lookup(overrides: Partial<SessionLookup> = {}): SessionLookup {
	return {
		id: "session-1",
		userId: "user-1",
		familyId: "family-1",
		expiresAt: new Date(Date.now() + 3_600_000),
		absoluteExpiresAt: new Date(Date.now() + 86_400_000),
		revokedAt: null,
		revokedReason: null,
		userDisabledAt: null,
		...overrides,
	};
}

function harness(found: SessionLookup | null, rotateResult = true) {
	const calls = {
		created: [] as Array<Record<string, unknown>>,
		rotated: [] as Array<Record<string, unknown>>,
		families: [] as Array<{ familyId: string; reason: SessionRevokeReason }>,
	};
	const repository: ISessionRepository = {
		create: async (input) => {
			calls.created.push(input as unknown as Record<string, unknown>);
			return { ...lookup({ id: "created-session", familyId: input.familyId }) };
		},
		findByTokenHash: async () => found,
		rotate: async (input) => {
			calls.rotated.push(input as unknown as Record<string, unknown>);
			return rotateResult;
		},
		findActiveUser: async () => null,
		listActive: async () => [],
		revokeByTokenHash: async () => {},
		revokeFamily: async (familyId, reason) => { calls.families.push({ familyId, reason }); },
		revokeOwned: async () => true,
		revokeAll: async () => {},
	};
	const audit = auditSpy();
	const tokenService = new TokenService();
	const service = new SessionService({ sessionRepository: repository, tokenService, auditService: audit });
	return { service, calls, audit, tokenService };
}

test("creating a session issues a verifiable access token bound to the session", async () => {
	const { service, calls, tokenService } = harness(null);
	const tokens = await service.create("user-1", { ip: "203.0.113.5", userAgent: "test-agent" });

	assert.equal(tokens.expiresIn, authConfig.accessTtlSeconds);
	assert.equal(calls.created.length, 1);
	assert.equal(calls.created[0]?.maxActive, authConfig.maxActiveSessions);
	assert.equal(calls.created[0]?.ipAddress, "203.0.113.5");
	assert.notEqual(calls.created[0]?.refreshTokenHash, tokens.refreshToken);
	assert.equal(calls.created[0]?.refreshTokenHash, tokenService.hash(tokens.refreshToken));

	const verified = await tokenService.verifyAccess(`Bearer ${tokens.accessToken}`);
	assert.deepEqual(verified, { userId: "user-1", sessionId: "created-session" });
});

test("rotation keeps the family and never extends past the absolute expiry", async () => {
	const absoluteExpiresAt = new Date(Date.now() + 60_000);
	const { service, calls } = harness(lookup({ absoluteExpiresAt }));
	const tokens = await service.rotate("some-refresh-token");

	assert.equal(calls.rotated.length, 1);
	assert.equal(calls.rotated[0]?.familyId, "family-1");
	assert.equal(calls.rotated[0]?.previousId, "session-1");
	assert.equal((calls.rotated[0]?.absoluteExpiresAt as Date).getTime(), absoluteExpiresAt.getTime());
	assert.ok(tokens.refreshExpiresAt.getTime() <= absoluteExpiresAt.getTime());
});

test("rotation rejects unknown tokens", async () => {
	const { service } = harness(null);
	await assert.rejects(service.rotate("unknown"), AuthenticationError);
});

test("reusing a rotated token outside the grace window revokes the whole family", async () => {
	const revokedAt = new Date(Date.now() - authConfig.refreshGraceMs - 60_000);
	const { service, calls, audit } = harness(lookup({ revokedAt, revokedReason: "ROTATED" }));

	await assert.rejects(service.rotate("stale-token"), AuthenticationError);
	assert.deepEqual(calls.families, [{ familyId: "family-1", reason: "REUSE_DETECTED" }]);
	assert.equal(audit.events[0]?.action, "auth.session.reuse_detected");
	assert.equal(calls.rotated.length, 0);
});

test("a rotated token presented inside the grace window is a retryable conflict", async () => {
	const { service, calls } = harness(lookup({ revokedAt: new Date(), revokedReason: "ROTATED" }));

	await assert.rejects(service.rotate("just-rotated"), RefreshConflictError);
	assert.equal(calls.families.length, 0);
});

test("tokens revoked for other reasons are rejected without killing the family", async () => {
	const { service, calls } = harness(lookup({ revokedAt: new Date(Date.now() - 600_000), revokedReason: "LOGOUT" }));

	await assert.rejects(service.rotate("logged-out"), AuthenticationError);
	assert.equal(calls.families.length, 0);
});

test("rotation refuses sessions past their absolute lifetime", async () => {
	const { service, calls } = harness(lookup({ absoluteExpiresAt: new Date(Date.now() - 1000) }));

	await assert.rejects(service.rotate("old-token"), AuthenticationError);
	assert.equal(calls.rotated.length, 0);
});

test("rotation refuses disabled users and revokes their family", async () => {
	const { service, calls } = harness(lookup({ userDisabledAt: new Date() }));

	await assert.rejects(service.rotate("token"), AuthenticationError);
	assert.deepEqual(calls.families, [{ familyId: "family-1", reason: "USER_DISABLED" }]);
});

test("losing a rotation race surfaces as a conflict instead of revoking sessions", async () => {
	const { service, calls } = harness(lookup(), false);

	await assert.rejects(service.rotate("racing-token"), RefreshConflictError);
	assert.equal(calls.families.length, 0);
});

function keyId(secret: string): string {
	return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

async function signWith(secret: string, options: { kid?: string; audience?: string } = {}): Promise<string> {
	return new SignJWT({ sid: "session-1" })
		.setProtectedHeader({ alg: "HS256", kid: options.kid ?? keyId(secret) })
		.setSubject("user-1")
		.setIssuer(authConfig.jwt.issuer)
		.setAudience(options.audience ?? authConfig.jwt.audience)
		.setIssuedAt()
		.setExpirationTime("5m")
		.sign(new TextEncoder().encode(secret));
}

test("access tokens signed with the previous key still verify during rotation", async () => {
	const previous = authConfig.jwt.previousSecret as string;
	const verified = await new TokenService().verifyAccess(`Bearer ${await signWith(previous)}`);
	assert.deepEqual(verified, { userId: "user-1", sessionId: "session-1" });
});

test("access tokens with unknown keys, wrong audiences or bad headers are rejected", async () => {
	const tokens = new TokenService();
	const unknownSecret = "unknown-secret-unknown-secret-unknown-00";
	const candidates = [
		`Bearer ${await signWith(unknownSecret)}`,
		`Bearer ${await signWith(authConfig.jwt.secret, { audience: "someone-else" })}`,
		`Bearer ${await signWith(authConfig.jwt.secret, { kid: "bogus" })}`,
		"Bearer",
		"Basic abc",
		"",
	];
	for (const header of candidates) {
		await assert.rejects(tokens.verifyAccess(header), AuthenticationError);
	}
	await assert.rejects(tokens.verifyAccess(undefined), AuthenticationError);
});
