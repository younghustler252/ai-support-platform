export type TenantRole = "OWNER" | "ADMIN" | "MEMBER";
export type TenantMembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED";

export interface OrganizationAccess {
	organizationId: string;
	role: TenantRole;
}

export interface ApplicationAccess {
	organizationId: string;
	applicationId: string;
	organizationRole: TenantRole;
	role: TenantRole;
	viaOrganization: boolean;
}

export interface TenantContext {
	organizationId: string;
	applicationId: string | null;
	organizationRole: TenantRole;
	role: TenantRole;
}
