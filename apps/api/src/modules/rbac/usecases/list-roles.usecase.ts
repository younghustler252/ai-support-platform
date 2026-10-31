import type { RoleTarget, RoleView } from "../rbac.types.js";
import type { IRoleRepository } from "../repositories/role.repository.interface.js";

export class ListRolesUseCase {
	constructor(private readonly deps: { roleRepository: IRoleRepository }) {}

	execute(target: RoleTarget): Promise<RoleView[]> {
		return this.deps.roleRepository.list(target);
	}
}
