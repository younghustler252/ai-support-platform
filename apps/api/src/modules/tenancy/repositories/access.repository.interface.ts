import type { TenantMembershipStatus, TenantRole } from "../tenancy.types.js";

export interface OrganizationMembershipRecord {
	role: TenantRole;
	status: TenantMembershipStatus;
	organizationArchivedAt: Date | null;
}

export interface ApplicationAccessRecord {
	archivedAt: Date | null;
	organizationArchivedAt: Date | null;
	organizationRole: TenantRole | null;
	organizationStatus: TenantMembershipStatus | null;
	applicationRole: TenantRole | null;
	applicationStatus: TenantMembershipStatus | null;
}

export interface IAccessRepository {
	findOrganizationMembership(userId: string, organizationId: string): Promise<OrganizationMembershipRecord | null>;
	findApplicationAccess(userId: string, organizationId: string, applicationId: string): Promise<ApplicationAccessRecord | null>;
}
