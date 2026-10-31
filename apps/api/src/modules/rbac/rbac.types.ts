import type { RoleGrant } from "../tenancy/tenancy.types.js";

export type RoleTarget =
	| { realm: "ORGANIZATION"; organizationId: string }
	| { realm: "APPLICATION"; organizationId: string; applicationId: string };

export interface RoleView {
	id: string;
	key: string | null;
	name: string;
	description: string | null;
	realm: "ORGANIZATION" | "APPLICATION";
	system: boolean;
	permissions: RoleGrant[];
	assignedCount: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface RoleAssignment {
	userId: string;
	email: string;
	displayName: string | null;
	assignedAt: Date;
}

export type AssignResult = "assigned" | "already" | "not-member" | "role-missing" | "limit";

export function scopeKeyOf(target: RoleTarget): string {
	return target.realm === "APPLICATION" ? target.applicationId : target.organizationId;
}
