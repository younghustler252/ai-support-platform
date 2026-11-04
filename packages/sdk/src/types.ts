export type TenantRole = "OWNER" | "ADMIN" | "MEMBER";

export interface User {
	id: string;
	email: string;
	displayName: string | null;
	emailVerifiedAt: string | null;
}

export interface Organization {
	id: string;
	name: string;
	slug: string;
	createdAt: string;
}

export interface OrganizationWithRole extends Organization {
	role: TenantRole;
}

export interface Application {
	id: string;
	organizationId: string;
	name: string;
	slug: string;
	description: string | null;
	allowedOrigins: string[];
	createdAt: string;
	updatedAt: string;
}

export interface RegisterInput {
	email: string;
	password: string;
	displayName?: string;
}

export interface LoginInput {
	email: string;
	password: string;
}

export interface CreateApplicationInput {
	name: string;
	slug?: string;
	description?: string;
	allowedOrigins?: string[];
}

export interface UpdateApplicationInput {
	name?: string;
	description?: string | null;
	allowedOrigins?: string[];
}
