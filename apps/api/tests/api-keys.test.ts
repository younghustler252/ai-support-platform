import assert from "node:assert/strict";
import { test } from "node:test";

import { tenancyConfig } from "../src/config/tenancy.js";
import { AuthenticationError, ForbiddenError, LimitExceededError, NotFoundError } from "../src/foundation/errors/app-error.js";
import type { ApiKeyPrincipal } from "../src/modules/api-keys/api-keys.types.js";
import { requireApiKey } from "../src/modules/api-keys/middleware/require-api-key.js";
import type {
	ApiKeyAuthRecord,
	ApiKeyView,
	IApiKeyRepository,
	NewApiKey,
} from "../src/modules/api-keys/repositories/api-key.repository.interface.js";
import { ApiKeyAuthService } from "../src/modules/api-keys/services/api-key-auth.service.js";
import { ApiKeyService } from "../src/modules/api-keys/services/api-key.service.js";
import { CreateApiKeyUseCase } from "../src/modules/api-keys/usecases/create-api-key.usecase.js";
import { RevokeApiKeyUseCase } from "../src/modules/api-keys/usecases/revoke-api-key.usecase.js";
import { RotateApiKeyUseCase } from "../src/modules/api-keys/usecases/rotate-api-key.usecase.js";
import { auditSpy } from "./helpers.js";

const service = new ApiKeyService();

function view(overrides: Partial<ApiKeyView> = {}): ApiKeyView {
	return {
		id: "key-1",
		name: "Backend",
		prefix: "sak_abcdefgh",
		scopes: ["chat"],
		expiresAt: null,
		lastUsedAt: null,
		revokedAt: null,
		createdAt: new Date(),
		createdByUserId: "user-1",
		...overrides,
	};
}

function authRecord(overrides: Partial<ApiKeyAuthRecord> = {}): ApiKeyAuthRecord {
	return {
		id: "key-1",
		prefix: "sak_abcdefgh",
		scopes: ["chat", "conversations:read"],
		expiresAt: null,
		revokedAt: null,
		lastUsedAt: new Date(),
		organizationId: "org-1",
		organizationArchivedAt: null,
		application: { id: "app-1", name: "Web", slug: "web", allowedOrigins: ["https://example.com"], archivedAt: null },
		...overrides,
	};
}

function repository(overrides: Partial<IApiKeyRepository> = {}): IApiKeyRepository {
	return {
		create: async (input: NewApiKey) => view({ prefix: input.prefix, name: input.name, scopes: input.scopes }),
		countActive: async () => 0,
		list: async () => [],
		findOwned: async () => null,
		revoke: async () => false,
		rotate: async () => null,
		findAuthRecord: async () => null,
		touchLastUsed: async () => {},
		...overrides,
	};
}

test("generated keys are well formed, unique and stored only as hashes", () => {
	const first = service.generate();
	const second = service.generate();
	assert.ok(service.isWellFormed(first.key));
	assert.notEqual(first.key, second.key);
	assert.ok(first.key.startsWith(`${first.prefix}_`));
	assert.equal(first.hash, service.hash(first.key));
	assert.match(first.hash, /^[a-f0-9]{64}$/);
	assert.ok(!first.hash.includes(first.key));
});

test("keys are extracted from bearer or x-api-key headers and malformed input is ignored", () => {
	const { key } = service.generate();
	assert.equal(service.extract({ authorization: `Bearer ${key}` }), key);
	assert.equal(service.extract({ authorization: `bearer ${key}` }), key);
	assert.equal(service.extract({ apiKeyHeader: ` ${key} ` }), key);
	assert.equal(service.extract({ authorization: "Bearer some.jwt.token" }), null);
	assert.equal(service.extract({ authorization: "Bearer some.jwt.token", apiKeyHeader: key }), key);
	assert.equal(service.extract({ apiKeyHeader: `${key}x` }), null);
	assert.equal(service.extract({ apiKeyHeader: "sak_short" }), null);
	assert.equal(service.extract({}), null);
});

test("authentication returns the principal for a valid key", async () => {
	const { key, hash } = service.generate();
	let lookedUp = "";
	const auth = new ApiKeyAuthService({
		apiKeyService: service,
		apiKeyRepository: repository({
			findAuthRecord: async (value) => {
				lookedUp = value;
				return authRecord();
			},
		}),
	});
	const principal = await auth.authenticate({ authorization: `Bearer ${key}` });
	assert.equal(lookedUp, hash);
	assert.equal(principal.keyId, "key-1");
	assert.equal(principal.organizationId, "org-1");
	assert.equal(principal.application.id, "app-1");
	assert.deepEqual(principal.scopes, ["chat", "conversations:read"]);
});

test("revoked, expired, archived and unknown keys all fail with the same error", async () => {
	const { key } = service.generate();
	const cases: Array<ApiKeyAuthRecord | null> = [
		null,
		authRecord({ revokedAt: new Date() }),
		authRecord({ expiresAt: new Date(Date.now() - 1000) }),
		authRecord({ organizationArchivedAt: new Date() }),
		authRecord({ application: { ...authRecord().application, archivedAt: new Date() } }),
	];
	const messages = new Set<string>();
	for (const found of cases) {
		const auth = new ApiKeyAuthService({ apiKeyService: service, apiKeyRepository: repository({ findAuthRecord: async () => found }) });
		await assert.rejects(auth.authenticate({ authorization: `Bearer ${key}` }), (error: unknown) => {
			assert.ok(error instanceof AuthenticationError);
			messages.add(error.message);
			return true;
		});
	}
	assert.equal(messages.size, 1);

	const noKey = new ApiKeyAuthService({ apiKeyService: service, apiKeyRepository: repository() });
	await assert.rejects(noKey.authenticate({}), AuthenticationError);
});

test("last-used is touched only when stale and a failing touch never breaks the request", async () => {
	const { key } = service.generate();
	let touches = 0;
	const fresh = new ApiKeyAuthService({
		apiKeyService: service,
		apiKeyRepository: repository({
			findAuthRecord: async () => authRecord({ lastUsedAt: new Date() }),
			touchLastUsed: async () => { touches += 1; },
		}),
	});
	await fresh.authenticate({ authorization: `Bearer ${key}` });
	assert.equal(touches, 0);

	const stale = new ApiKeyAuthService({
		apiKeyService: service,
		apiKeyRepository: repository({
			findAuthRecord: async () => authRecord({ lastUsedAt: new Date(Date.now() - tenancyConfig.apiKey.lastUsedThrottleMs - 1000) }),
			touchLastUsed: async () => {
				touches += 1;
				throw new Error("database down");
			},
		}),
	});
	await stale.authenticate({ authorization: `Bearer ${key}` });
	assert.equal(touches, 1);
});

test("creating a key returns the secret once and stores only its hash", async () => {
	const audit = auditSpy();
	let stored: NewApiKey | undefined;
	const useCase = new CreateApiKeyUseCase({
		apiKeyService: service,
		auditService: audit,
		apiKeyRepository: repository({
			create: async (input) => {
				stored = input;
				return view({ prefix: input.prefix });
			},
		}),
	});
	const result = await useCase.execute({ organizationId: "org-1", applicationId: "app-1", actorId: "user-1", name: "Backend", scopes: ["chat"] });
	assert.ok(stored);
	assert.equal(stored.keyHash, service.hash(result.key));
	assert.notEqual(stored.keyHash, result.key);
	assert.equal(stored.createdByUserId, "user-1");
	assert.equal(audit.events[0]?.action, "api_key.created");
	assert.ok(!JSON.stringify(audit.events).includes(result.key));
});

test("creating a key beyond the application limit is refused", async () => {
	const useCase = new CreateApiKeyUseCase({
		apiKeyService: service,
		auditService: auditSpy(),
		apiKeyRepository: repository({ countActive: async () => tenancyConfig.limits.apiKeysPerApplication }),
	});
	await assert.rejects(
		useCase.execute({ organizationId: "org-1", applicationId: "app-1", actorId: "user-1", name: "Extra", scopes: ["chat"] }),
		LimitExceededError,
	);
});

test("rotation copies name, scopes and expiry and applies the grace window", async () => {
	const expiry = new Date(Date.now() + 86_400_000);
	let rotation: Parameters<IApiKeyRepository["rotate"]>[0] | undefined;
	const audit = auditSpy();
	const useCase = new RotateApiKeyUseCase({
		apiKeyService: service,
		auditService: audit,
		apiKeyRepository: repository({
			findOwned: async () => view({ name: "Prod", scopes: ["chat", "knowledge:read"], expiresAt: expiry }),
			rotate: async (input) => {
				rotation = input;
				return view({ id: "key-2", prefix: input.next.prefix });
			},
		}),
	});

	const before = Date.now();
	const result = await useCase.execute({ organizationId: "org-1", applicationId: "app-1", keyId: "key-1", actorId: "user-1", graceHours: 2 });
	assert.ok(rotation);
	assert.equal(rotation.next.name, "Prod");
	assert.deepEqual(rotation.next.scopes, ["chat", "knowledge:read"]);
	assert.equal(rotation.next.expiresAt, expiry);
	assert.equal(rotation.next.keyHash, service.hash(result.key));
	assert.ok(rotation.graceUntil && rotation.graceUntil.getTime() >= before + 2 * 3_600_000);
	assert.equal(audit.events[0]?.action, "api_key.rotated");

	await useCase.execute({ organizationId: "org-1", applicationId: "app-1", keyId: "key-1", actorId: "user-1", graceHours: 0 });
	assert.equal(rotation.graceUntil, null);
});

test("rotating or revoking a missing or already revoked key is not found", async () => {
	const rotate = new RotateApiKeyUseCase({
		apiKeyService: service,
		auditService: auditSpy(),
		apiKeyRepository: repository({ findOwned: async () => view({ revokedAt: new Date() }) }),
	});
	await assert.rejects(rotate.execute({ organizationId: "o", applicationId: "a", keyId: "k", actorId: "u", graceHours: 1 }), NotFoundError);

	const missing = new RotateApiKeyUseCase({ apiKeyService: service, auditService: auditSpy(), apiKeyRepository: repository() });
	await assert.rejects(missing.execute({ organizationId: "o", applicationId: "a", keyId: "k", actorId: "u", graceHours: 1 }), NotFoundError);

	const revoke = new RevokeApiKeyUseCase({ apiKeyRepository: repository(), auditService: auditSpy() });
	await assert.rejects(revoke.execute({ organizationId: "o", applicationId: "a", keyId: "k", actorId: "u" }), NotFoundError);

	const audit = auditSpy();
	const ok = new RevokeApiKeyUseCase({ apiKeyRepository: repository({ revoke: async () => true }), auditService: audit });
	assert.deepEqual(await ok.execute({ organizationId: "o", applicationId: "a", keyId: "k", actorId: "u" }), { revoked: true });
	assert.equal(audit.events[0]?.action, "api_key.revoked");
});

function principal(scopes: string[]): ApiKeyPrincipal {
	return {
		keyId: "key-1",
		keyPrefix: "sak_abcdefgh",
		scopes,
		organizationId: "org-1",
		application: { id: "app-1", name: "Web", slug: "web", allowedOrigins: [] },
	};
}

function run(handler: ReturnType<typeof requireApiKey>, scopes: string[]) {
	const context: { organizationId?: string; applicationId?: string } = {};
	const response = {
		locals: {
			requestContext: context,
			scope: { resolve: () => ({ authenticate: async () => principal(scopes) }) },
		},
	};
	const request = { get: () => undefined };
	let nextCalled = false;
	const result = (handler as unknown as (...args: unknown[]) => Promise<void>)(request, response, () => { nextCalled = true; });
	return { result, response, context, called: () => nextCalled };
}

test("requireApiKey enforces scopes and records the tenant in the request context", async () => {
	const allowed = run(requireApiKey("chat"), ["chat"]);
	await allowed.result;
	assert.ok(allowed.called());
	assert.equal(allowed.context.organizationId, "org-1");
	assert.equal(allowed.context.applicationId, "app-1");
	assert.equal((allowed.response.locals as { apiKey?: ApiKeyPrincipal }).apiKey?.keyId, "key-1");

	const denied = run(requireApiKey("knowledge:write"), ["chat"]);
	await assert.rejects(denied.result, ForbiddenError);
	assert.equal(denied.called(), false);

	const unscoped = run(requireApiKey(), []);
	await unscoped.result;
	assert.ok(unscoped.called());
});
