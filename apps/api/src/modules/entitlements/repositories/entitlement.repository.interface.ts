import type { StoredPlan } from "../entitlement.types.js";

export interface IEntitlementRepository {
	findOrganizationPlan(organizationId: string): Promise<StoredPlan | null>;
	organizationOfApplication(applicationId: string): Promise<string | null>;
	countApplications(organizationId: string): Promise<number>;
	countAiRequestsSince(organizationId: string, since: Date): Promise<number>;
}
