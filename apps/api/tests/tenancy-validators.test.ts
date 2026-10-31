import assert from "node:assert/strict";
import { test } from "node:test";

import { tenancyConfig } from "../src/config/tenancy.js";
import { normalizeOrigin, originSchema, slugSchema } from "../src/foundation/validation/fields.js";
import { slugify, SLUG_PATTERN, withRandomSuffix } from "../src/foundation/utils/slug.js";
import { createApiKeySchema, rotateApiKeySchema } from "../src/modules/api-keys/validators/api-key.validator.js";
import { createApplicationSchema, updateApplicationSchema } from "../src/modules/applications/validators/application.validator.js";

test("slugs are normalised and reserved or malformed values are rejected", () => {
	assert.equal(slugSchema.parse("  My-App  "), "my-app");
	for (const bad of ["ab", "-bad", "bad-", "double--hyphen", "has space", "under_score", "x".repeat(41), "admin", "api"]) {
		assert.equal(slugSchema.safeParse(bad).success, false, bad);
	}
});

test("slugify produces valid slugs and falls back when nothing usable remains", () => {
	assert.equal(slugify("Acme Support, Inc."), "acme-support-inc");
	assert.match(slugify("!!!", "org"), SLUG_PATTERN);
	assert.match(withRandomSuffix("acme"), /^acme-[a-z0-9]+$/);
	assert.match(withRandomSuffix("acme"), SLUG_PATTERN);
});

test("origins must be bare http(s) origins and are normalised", () => {
	assert.equal(normalizeOrigin("https://Example.com"), "https://example.com");
	assert.equal(normalizeOrigin("https://example.com:8443/"), "https://example.com:8443");
	assert.equal(normalizeOrigin("http://localhost:3000"), "http://localhost:3000");
	for (const bad of ["ftp://example.com", "https://example.com/path", "https://example.com?x=1", "https://user:pw@example.com", "example.com", "javascript:alert(1)"]) {
		assert.equal(normalizeOrigin(bad), null, bad);
		assert.equal(originSchema.safeParse(bad).success, false, bad);
	}
});

test("application creation normalises and de-duplicates allowed origins", () => {
	const parsed = createApplicationSchema.parse({
		name: "  Web App ",
		allowedOrigins: ["https://Example.com", "https://example.com/", "http://localhost:3000"],
	});
	assert.equal(parsed.name, "Web App");
	assert.deepEqual(parsed.allowedOrigins, ["https://example.com", "http://localhost:3000"]);
	assert.deepEqual(createApplicationSchema.parse({ name: "Web App" }).allowedOrigins, []);
});

test("application schemas reject unknown fields, too many origins and empty updates", () => {
	assert.equal(createApplicationSchema.safeParse({ name: "Web", organizationId: "x" }).success, false);
	const many = Array.from({ length: tenancyConfig.limits.allowedOriginsPerApplication + 1 }, (_, index) => `https://site${index}.example.com`);
	assert.equal(createApplicationSchema.safeParse({ name: "Web", allowedOrigins: many }).success, false);
	assert.equal(updateApplicationSchema.safeParse({}).success, false);
	assert.equal(updateApplicationSchema.safeParse({ description: null }).success, true);
	assert.equal(updateApplicationSchema.safeParse({ slug: "new-slug" }).success, false);
});

test("api key creation validates scopes, de-duplicates them and bounds expiry", () => {
	const parsed = createApiKeySchema.parse({ name: " Backend ", scopes: ["chat", "chat", "knowledge:read"] });
	assert.equal(parsed.name, "Backend");
	assert.deepEqual(parsed.scopes, ["chat", "knowledge:read"]);

	assert.equal(createApiKeySchema.safeParse({ name: "x", scopes: [] }).success, false);
	assert.equal(createApiKeySchema.safeParse({ name: "x", scopes: ["admin"] }).success, false);
	assert.equal(createApiKeySchema.safeParse({ name: "", scopes: ["chat"] }).success, false);

	const past = new Date(Date.now() - 1000).toISOString();
	const soon = new Date(Date.now() + 86_400_000).toISOString();
	const far = new Date(Date.now() + 3 * 365 * 86_400_000).toISOString();
	assert.equal(createApiKeySchema.safeParse({ name: "x", scopes: ["chat"], expiresAt: past }).success, false);
	assert.equal(createApiKeySchema.safeParse({ name: "x", scopes: ["chat"], expiresAt: far }).success, false);
	const ok = createApiKeySchema.parse({ name: "x", scopes: ["chat"], expiresAt: soon });
	assert.ok(ok.expiresAt instanceof Date);
});

test("rotation accepts a missing body and bounds the grace period", () => {
	assert.deepEqual(rotateApiKeySchema.parse(undefined), { graceHours: tenancyConfig.apiKey.defaultRotationGraceHours });
	assert.deepEqual(rotateApiKeySchema.parse({}), { graceHours: tenancyConfig.apiKey.defaultRotationGraceHours });
	assert.equal(rotateApiKeySchema.parse({ graceHours: 0 }).graceHours, 0);
	assert.equal(rotateApiKeySchema.safeParse({ graceHours: tenancyConfig.apiKey.maxRotationGraceHours + 1 }).success, false);
	assert.equal(rotateApiKeySchema.safeParse({ graceHours: -1 }).success, false);
	assert.equal(rotateApiKeySchema.safeParse({ graceHours: 1.5 }).success, false);
});
