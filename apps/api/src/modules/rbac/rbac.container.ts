import { asClass, type AwilixContainer } from "awilix";

import { RoleController } from "./controllers/role.controller.js";
import { RoleRepositoryImpl } from "./repositories/role.repository.impl.js";
import { AssignRoleUseCase } from "./usecases/assign-role.usecase.js";
import { CreateRoleUseCase } from "./usecases/create-role.usecase.js";
import { DeleteRoleUseCase } from "./usecases/delete-role.usecase.js";
import { GetRoleUseCase } from "./usecases/get-role.usecase.js";
import { ListPermissionsUseCase } from "./usecases/list-permissions.usecase.js";
import { ListRoleAssignmentsUseCase } from "./usecases/list-role-assignments.usecase.js";
import { ListRolesUseCase } from "./usecases/list-roles.usecase.js";
import { UnassignRoleUseCase } from "./usecases/unassign-role.usecase.js";
import { UpdateRoleUseCase } from "./usecases/update-role.usecase.js";

export function registerRbac(container: AwilixContainer): void {
	container.register({
		roleRepository: asClass(RoleRepositoryImpl).scoped(),
		listRolesUseCase: asClass(ListRolesUseCase).scoped(),
		getRoleUseCase: asClass(GetRoleUseCase).scoped(),
		listPermissionsUseCase: asClass(ListPermissionsUseCase).scoped(),
		createRoleUseCase: asClass(CreateRoleUseCase).scoped(),
		updateRoleUseCase: asClass(UpdateRoleUseCase).scoped(),
		deleteRoleUseCase: asClass(DeleteRoleUseCase).scoped(),
		assignRoleUseCase: asClass(AssignRoleUseCase).scoped(),
		unassignRoleUseCase: asClass(UnassignRoleUseCase).scoped(),
		listRoleAssignmentsUseCase: asClass(ListRoleAssignmentsUseCase).scoped(),
		roleController: asClass(RoleController).scoped(),
	});
}
