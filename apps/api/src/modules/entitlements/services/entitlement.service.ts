import { LimitExceededError } from "../../../foundation/errors/app-error.js";
import { defaultPlanCode, featureCatalog, findPlanDefinition, type FeatureCode } from "../entitlement-catalog.js";
import type { EntitlementUsage, PlanOverview, ResolvedPlan } from "../entitlement.types.js";
import type { IEntitlementRepository } from "../repositories/entitlement.repository.interface.js";

export interface IEntitlementService {
	planFor(organizationId: string): Promise<ResolvedPlan>;
	assertWithin(organizationId: string, feature: FeatureCode, current: number, hardCap?: number): Promise<void>;
	canUseAi(applicationId: string): Promise<boolean>;
	overview(organizationId: string): Promise<PlanOverview>;
}

const monthStart = (now: Date): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

const featureLabels: Record<FeatureCode, string> = {
	applications: "applications",
	knowledge_articles: "knowledge articles per application",
	ai_assistant: "AI replies",
	ai_replies_monthly: "AI requests per month",
};

export class EntitlementService implements IEntitlementService {
	constructor(
		private readonly deps: { entitlementRepository: IEntitlementRepository },
		private readonly now: () => Date = () => new Date(),
	) {}

	async planFor(organizationId: string): Promise<ResolvedPlan> {
		const stored = await this.deps.entitlementRepository.findOrganizationPlan(organizationId);
		const fallback = findPlanDefinition(stored?.code ?? defaultPlanCode) ?? findPlanDefinition(defaultPlanCode);
		if (!fallback) throw new Error("Default plan is missing from the catalog");

		const entitlements = { ...fallback.entitlements };
		for (const item of stored?.entitlements ?? []) {
			if (item.feature in entitlements) entitlements[item.feature as FeatureCode] = { enabled: item.enabled, limit: item.limit };
		}
		return { code: stored?.code ?? fallback.code, name: stored?.name ?? fallback.name, entitlements };
	}

	async assertWithin(organizationId: string, feature: FeatureCode, current: number, hardCap: number = Number.POSITIVE_INFINITY): Promise<void> {
		const entitlement = (await this.planFor(organizationId)).entitlements[feature];
		if (!entitlement.enabled) throw new LimitExceededError(`Your plan does not include ${featureLabels[feature]}`);
		const limit = Math.min(entitlement.limit ?? Number.POSITIVE_INFINITY, hardCap);
		if (current >= limit) throw new LimitExceededError(`Your plan allows up to ${limit} ${featureLabels[feature]}`);
	}

	async canUseAi(applicationId: string): Promise<boolean> {
		const { entitlementRepository } = this.deps;
		const organizationId = await entitlementRepository.organizationOfApplication(applicationId);
		if (!organizationId) return false;
		const { entitlements } = await this.planFor(organizationId);
		if (!entitlements.ai_assistant.enabled || !entitlements.ai_replies_monthly.enabled) return false;
		const limit = entitlements.ai_replies_monthly.limit;
		if (limit === null) return true;
		return (await entitlementRepository.countAiRequestsSince(organizationId, monthStart(this.now()))) < limit;
	}

	async overview(organizationId: string): Promise<PlanOverview> {
		const { entitlementRepository } = this.deps;
		const plan = await this.planFor(organizationId);
		const used: Partial<Record<FeatureCode, number>> = {
			applications: await entitlementRepository.countApplications(organizationId),
			ai_replies_monthly: await entitlementRepository.countAiRequestsSince(organizationId, monthStart(this.now())),
		};
		const entitlements: EntitlementUsage[] = featureCatalog.map((feature) => ({
			feature: feature.code,
			description: feature.description,
			scope: feature.scope,
			enabled: plan.entitlements[feature.code].enabled,
			limit: plan.entitlements[feature.code].limit,
			used: used[feature.code] ?? null,
		}));
		return { plan: { code: plan.code, name: plan.name }, entitlements };
	}
}
