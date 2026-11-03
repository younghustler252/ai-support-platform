import type { EntitlementValue, FeatureCode } from "./entitlement-catalog.js";

export interface ResolvedPlan {
	code: string;
	name: string;
	entitlements: Record<FeatureCode, EntitlementValue>;
}

export interface StoredPlan {
	code: string;
	name: string;
	entitlements: Array<{ feature: string; enabled: boolean; limit: number | null }>;
}

export interface EntitlementUsage {
	feature: FeatureCode;
	description: string;
	scope: "organization" | "application";
	enabled: boolean;
	limit: number | null;
	used: number | null;
}

export interface PlanOverview {
	plan: { code: string; name: string };
	entitlements: EntitlementUsage[];
}
