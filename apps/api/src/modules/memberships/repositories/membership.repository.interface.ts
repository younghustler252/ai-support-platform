import type { TenantRole } from "../../tenancy/tenancy.types.js";

export interface OrganizationMemberView {
	userId: string;
	email: string;
	displayName: string | null;
	role: TenantRole;
	joinedAt: Date;
}

export interface ApplicationMemberView {
	userId: string;
	email: string;
	displayName: string | null;
	role: TenantRole;
	addedAt: Date;
}

export type RoleChangeResult = "updated" | "not_found" | "last_owner";
export type RemoveResult = "removed" | "not_found" | "last_owner";
export type AddApplicationMemberResult = "added" | "not_org_member" | "exists" | "not_found";

export interface IMembershipRepository {
	listOrganizationMembers(organizationId: string): Promise<OrganizationMemberView[]>;
	findOrganizationMember(organizationId: string, userId: string): Promise<{ userId: string; role: TenantRole } | null>;
	changeOrganizationMemberRole(organizationId: string, userId: string, role: TenantRole): Promise<RoleChangeResult>;
	removeOrganizationMember(organizationId: string, userId: string): Promise<RemoveResult>;
	listApplicationMembers(organizationId: string, applicationId: string): Promise<ApplicationMemberView[]>;
	addApplicationMember(
		organizationId: string,
		applicationId: string,
		userId: string,
		role: TenantRole,
	): Promise<AddApplicationMemberResult>;
	changeApplicationMemberRole(
		organizationId: string,
		applicationId: string,
		userId: string,
		role: TenantRole,
	): Promise<boolean>;
	removeApplicationMember(organizationId: string, applicationId: string, userId: string): Promise<boolean>;
}
