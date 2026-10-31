import type { RoleGrant } from "../../tenancy/tenancy.types.js";
import type { AssignResult, RoleAssignment, RoleTarget, RoleView } from "../rbac.types.js";

export interface IRoleRepository {
	list(target: RoleTarget): Promise<RoleView[]>;
	find(target: RoleTarget, roleId: string): Promise<RoleView | null>;
	countCustom(target: RoleTarget): Promise<number>;
	create(target: RoleTarget, input: { name: string; description: string | null; permissions: RoleGrant[]; actorId: string }): Promise<RoleView>;
	update(
		target: RoleTarget,
		roleId: string,
		patch: { name?: string; description?: string | null; permissions?: RoleGrant[] },
	): Promise<RoleView | null>;
	remove(target: RoleTarget, roleId: string): Promise<boolean>;
	listAssignments(target: RoleTarget, roleId: string): Promise<RoleAssignment[]>;
	assign(target: RoleTarget, input: { roleId: string; userId: string; actorId: string }): Promise<AssignResult>;
	unassign(target: RoleTarget, roleId: string, userId: string): Promise<boolean>;
}
