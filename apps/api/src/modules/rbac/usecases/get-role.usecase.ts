import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { RoleTarget, RoleView } from "../rbac.types.js";
import type { IRoleRepository } from "../repositories/role.repository.interface.js";

export class GetRoleUseCase {
	constructor(private readonly deps: { roleRepository: IRoleRepository }) {}

	async execute(target: RoleTarget, roleId: string): Promise<RoleView> {
		const role = await this.deps.roleRepository.find(target, roleId);
		if (!role) throw new NotFoundError("Role not found");
		return role;
	}
}
