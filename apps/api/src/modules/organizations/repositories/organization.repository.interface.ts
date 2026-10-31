import type { TenantRole } from "../../tenancy/tenancy.types.js";

export interface OrganizationView {
	id: string;
	name: string;
	slug: string;
	createdAt: Date;
}

export interface OrganizationWithRole extends OrganizationView {
	role: TenantRole;
}

export interface IOrganizationRepository {
	createWithOwner(input: { name: string; slug: string; userId: string }): Promise<OrganizationView>;
	countOwnedBy(userId: string): Promise<number>;
	listForUser(userId: string): Promise<OrganizationWithRole[]>;
	findById(id: string): Promise<OrganizationView | null>;
	update(id: string, data: { name: string }): Promise<OrganizationView | null>;
	archive(id: string): Promise<boolean>;
}
