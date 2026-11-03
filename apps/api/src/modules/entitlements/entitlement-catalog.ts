export const featureCodes = ["applications", "knowledge_articles", "ai_assistant", "ai_replies_monthly"] as const;

export type FeatureCode = (typeof featureCodes)[number];

export type FeatureScope = "organization" | "application";

export interface FeatureDefinition {
	code: FeatureCode;
	description: string;
	scope: FeatureScope;
}

export interface EntitlementValue {
	enabled: boolean;
	limit: number | null;
}

export interface PlanDefinition {
	code: string;
	name: string;
	entitlements: Record<FeatureCode, EntitlementValue>;
}

export const featureCatalog: readonly FeatureDefinition[] = [
	{ code: "applications", description: "Active applications in the organization", scope: "organization" },
	{ code: "knowledge_articles", description: "Knowledge articles per application", scope: "application" },
	{ code: "ai_assistant", description: "AI generated replies", scope: "organization" },
	{ code: "ai_replies_monthly", description: "AI requests per calendar month", scope: "organization" },
];

export const defaultPlanCode = "free";

export const planCatalog: readonly PlanDefinition[] = [
	{
		code: "free",
		name: "Free",
		entitlements: {
			applications: { enabled: true, limit: 3 },
			knowledge_articles: { enabled: true, limit: 25 },
			ai_assistant: { enabled: true, limit: null },
			ai_replies_monthly: { enabled: true, limit: 200 },
		},
	},
	{
		code: "pro",
		name: "Pro",
		entitlements: {
			applications: { enabled: true, limit: 10 },
			knowledge_articles: { enabled: true, limit: 200 },
			ai_assistant: { enabled: true, limit: null },
			ai_replies_monthly: { enabled: true, limit: 5000 },
		},
	},
	{
		code: "business",
		name: "Business",
		entitlements: {
			applications: { enabled: true, limit: 25 },
			knowledge_articles: { enabled: true, limit: 500 },
			ai_assistant: { enabled: true, limit: null },
			ai_replies_monthly: { enabled: true, limit: 50_000 },
		},
	},
];

export function findPlanDefinition(code: string): PlanDefinition | undefined {
	return planCatalog.find((plan) => plan.code === code);
}
