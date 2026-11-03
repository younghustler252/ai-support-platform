import assert from "node:assert/strict";
import { test } from "node:test";

import { tenancyConfig } from "../src/config/tenancy.js";
import { LimitExceededError } from "../src/foundation/errors/app-error.js";
import { featureCatalog, featureCodes, planCatalog } from "../src/modules/entitlements/entitlement-catalog.js";
import type { StoredPlan } from "../src/modules/entitlements/entitlement.types.js";
import type { IEntitlementRepository } from "../src/modules/entitlements/repositories/entitlement.repository.interface.js";
import { EntitlementService } from "../src/modules/entitlements/services/entitlement.service.js";

function service(overrides: Partial<IEntitlementRepository> = {}, now = new Date("2026-11-15T10:00:00Z")) {
	const since: Date[] = [];
	const repository: IEntitlementRepository = {
		findOrganizationPlan: async () => null,
		organizationOfApplication: async () => "org-1",
		countApplications: async () => 2,
		countAiRequestsSince: async (_org, date) => { since.push(date); return 150; },
		...overrides,
	};
	return { service: new EntitlementService({ entitlementRepository: repository }, () => now), since };
}

test("every plan defines every feature and stays inside the platform hard caps", () => {
	assert.ok(planCatalog.length >= 3);
	assert.equal(new Set(planCatalog.map((plan) => plan.code)).size, planCatalog.length);
	assert.deepEqual(featureCatalog.map((feature) => feature.code).sort(), [...featureCodes].sort());
	for (const plan of planCatalog) {
		for (const code of featureCodes) assert.ok(plan.entitlements[code], `${plan.code} misses ${code}`);
		assert.ok((plan.entitlements.applications.limit ?? 0) <= tenancyConfig.limits.applicationsPerOrganization);
		assert.ok((plan.entitlements.knowledge_articles.limit ?? 0) <= tenancyConfig.limits.articlesPerApplication);
	}
});

test("an organization without a plan gets the free plan", async () => {
	const plan = await service().service.planFor("org-1");
	assert.equal(plan.code, "free");
	assert.equal(plan.entitlements.applications.limit, planCatalog.find((item) => item.code === "free")?.entitlements.applications.limit);
});

test("a stored plan overrides catalog values and unknown or missing features fall back to the catalog", async () => {
	const stored: StoredPlan = {
		code: "pro",
		name: "Pro",
		entitlements: [
			{ feature: "applications", enabled: true, limit: 99 },
			{ feature: "made_up", enabled: true, limit: 1 },
		],
	};
	const plan = await service({ findOrganizationPlan: async () => stored }).service.planFor("org-1");
	assert.equal(plan.entitlements.applications.limit, 99);
	assert.equal(plan.entitlements.knowledge_articles.limit, planCatalog.find((item) => item.code === "pro")?.entitlements.knowledge_articles.limit);
	assert.ok(!("made_up" in plan.entitlements));
});

test("limits block at the plan limit, never exceed the hard cap and respect disabled features", async () => {
	const { service: gate } = service();
	await gate.assertWithin("org-1", "applications", 2);
	await assert.rejects(gate.assertWithin("org-1", "applications", 3), /up to 3 applications/);
	await assert.rejects(gate.assertWithin("org-1", "applications", 1, 1), LimitExceededError);

	const disabled: StoredPlan = { code: "free", name: "Free", entitlements: [{ feature: "ai_assistant", enabled: false, limit: null }] };
	await assert.rejects(service({ findOrganizationPlan: async () => disabled }).service.assertWithin("org-1", "ai_assistant", 0), /does not include/);

	const unlimited: StoredPlan = { code: "free", name: "Free", entitlements: [{ feature: "applications", enabled: true, limit: null }] };
	await service({ findOrganizationPlan: async () => unlimited }).service.assertWithin("org-1", "applications", 1000);
	await assert.rejects(service({ findOrganizationPlan: async () => unlimited }).service.assertWithin("org-1", "applications", 1000, 25), LimitExceededError);
});

test("AI use is capped per calendar month and needs the feature enabled", async () => {
	const free = planCatalog.find((plan) => plan.code === "free")?.entitlements.ai_replies_monthly.limit ?? 0;
	const under = service({ countAiRequestsSince: async () => free - 1 });
	assert.equal(await under.service.canUseAi("app-1"), true);
	assert.equal(await service({ countAiRequestsSince: async () => free }).service.canUseAi("app-1"), false);
	assert.equal(await service({ organizationOfApplication: async () => null }).service.canUseAi("app-1"), false);

	const off: StoredPlan = { code: "free", name: "Free", entitlements: [{ feature: "ai_assistant", enabled: false, limit: null }] };
	assert.equal(await service({ findOrganizationPlan: async () => off }).service.canUseAi("app-1"), false);

	const checked = service();
	await checked.service.canUseAi("app-1");
	assert.equal(checked.since[0]?.toISOString(), "2026-11-01T00:00:00.000Z");
});

test("the plan overview lists every feature with usage where it is organization wide", async () => {
	const overview = await service().service.overview("org-1");
	assert.equal(overview.plan.code, "free");
	assert.deepEqual(overview.entitlements.map((item) => item.feature), featureCodes.slice());
	const used = Object.fromEntries(overview.entitlements.map((item) => [item.feature, item.used]));
	assert.deepEqual(used, { applications: 2, knowledge_articles: null, ai_assistant: null, ai_replies_monthly: 150 });
});
