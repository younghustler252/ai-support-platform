import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { RoleAssignment, RoleTarget } from "../rbac.types.js";
import type { IRoleRepository } from "../repositories/role.repository.interface.js";

export class ListRoleAssignmentsUseCase {
	constructor(private readonly deps: { roleRepository: IRoleRepository }) {}

	async execute(target: RoleTarget, roleId: string): Promise<RoleAssignment[]> {
		const role = await this.deps.roleRepository.find(target, roleId);
		if (!role) throw new NotFoundError("Role not found");
		return role.system ? [] : this.deps.roleRepository.listAssignments(target, roleId);
	}
}
