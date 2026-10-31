export type TenantRole = "OWNER" | "ADMIN" | "MEMBER";
export type TenantMembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED";

export type GrantScope = "OWN" | "ASSIGNED" | "TEAM" | "APPLICATION" | "ORGANIZATION" | "ALL";
export type EffectiveGrants = Readonly<Record<string, GrantScope>>;

export interface RoleGrant {
	code: string;
	scope: GrantScope;
}

export interface OrganizationAccess {
	organizationId: string;
	role: TenantRole;
	grants: EffectiveGrants;
}

export interface ApplicationAccess {
	organizationId: string;
	applicationId: string;
	organizationRole: TenantRole;
	role: TenantRole;
	viaOrganization: boolean;
	grants: EffectiveGrants;
}

export interface TenantContext {
	organizationId: string;
	applicationId: string | null;
	organizationRole: TenantRole;
	role: TenantRole;
	grants: EffectiveGrants;
}
