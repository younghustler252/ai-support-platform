import type { Request, Response } from "express";

import { authContext, requestMeta, validatedBody, validatedParams } from "../../auth/http/auth-http.js";
import { tenantContext } from "../../tenancy/http/tenant-http.js";
import type { RoleTarget } from "../rbac.types.js";
import type { AssignRoleUseCase } from "../usecases/assign-role.usecase.js";
import type { CreateRoleUseCase } from "../usecases/create-role.usecase.js";
import type { DeleteRoleUseCase } from "../usecases/delete-role.usecase.js";
import type { GetRoleUseCase } from "../usecases/get-role.usecase.js";
import type { ListPermissionsUseCase } from "../usecases/list-permissions.usecase.js";
import type { ListRoleAssignmentsUseCase } from "../usecases/list-role-assignments.usecase.js";
import type { ListRolesUseCase } from "../usecases/list-roles.usecase.js";
import type { UnassignRoleUseCase } from "../usecases/unassign-role.usecase.js";
import type { UpdateRoleUseCase } from "../usecases/update-role.usecase.js";
import type { CreateRoleInput, RoleAssignmentParams, RoleParams, UpdateRoleInput } from "../validators/role.validator.js";

interface Dependencies {
	listRolesUseCase: ListRolesUseCase;
	getRoleUseCase: GetRoleUseCase;
	listPermissionsUseCase: ListPermissionsUseCase;
	createRoleUseCase: CreateRoleUseCase;
	updateRoleUseCase: UpdateRoleUseCase;
	deleteRoleUseCase: DeleteRoleUseCase;
	assignRoleUseCase: AssignRoleUseCase;
	unassignRoleUseCase: UnassignRoleUseCase;
	listRoleAssignmentsUseCase: ListRoleAssignmentsUseCase;
}

function targetOf(response: Response): RoleTarget {
	const { organizationId, applicationId } = tenantContext(response);
	return applicationId
		? { realm: "APPLICATION", organizationId, applicationId }
		: { realm: "ORGANIZATION", organizationId };
}

function actorOf(response: Response) {
	return { id: authContext(response).user.id, grants: tenantContext(response).grants };
}

export class RoleController {
	constructor(private readonly deps: Dependencies) {}

	listPermissions = async (_request: Request, response: Response): Promise<void> => {
		response.json({ data: { permissions: this.deps.listPermissionsUseCase.execute(targetOf(response)) } });
	};

	list = async (_request: Request, response: Response): Promise<void> => {
		response.json({ data: { roles: await this.deps.listRolesUseCase.execute(targetOf(response)) } });
	};

	get = async (_request: Request, response: Response): Promise<void> => {
		const { roleId } = validatedParams<RoleParams>(response);
		response.json({ data: { role: await this.deps.getRoleUseCase.execute(targetOf(response), roleId) } });
	};

	create = async (request: Request, response: Response): Promise<void> => {
		const input = validatedBody<CreateRoleInput>(response);
		const role = await this.deps.createRoleUseCase.execute(
			{ target: targetOf(response), actor: actorOf(response), ...input },
			requestMeta(request),
		);
		response.status(201).json({ data: { role } });
	};

	update = async (request: Request, response: Response): Promise<void> => {
		const { roleId } = validatedParams<RoleParams>(response);
		const patch = validatedBody<UpdateRoleInput>(response);
		const role = await this.deps.updateRoleUseCase.execute(
			{ target: targetOf(response), actor: actorOf(response), roleId, patch },
			requestMeta(request),
		);
		response.json({ data: { role } });
	};

	remove = async (request: Request, response: Response): Promise<void> => {
		const { roleId } = validatedParams<RoleParams>(response);
		response.json({
			data: await this.deps.deleteRoleUseCase.execute(
				{ target: targetOf(response), actor: actorOf(response), roleId },
				requestMeta(request),
			),
		});
	};

	listAssignments = async (_request: Request, response: Response): Promise<void> => {
		const { roleId } = validatedParams<RoleParams>(response);
		response.json({
			data: { members: await this.deps.listRoleAssignmentsUseCase.execute(targetOf(response), roleId) },
		});
	};

	assign = async (request: Request, response: Response): Promise<void> => {
		const { roleId, userId } = validatedParams<RoleAssignmentParams>(response);
		response.json({
			data: await this.deps.assignRoleUseCase.execute(
				{ target: targetOf(response), actor: actorOf(response), roleId, userId },
				requestMeta(request),
			),
		});
	};

	unassign = async (request: Request, response: Response): Promise<void> => {
		const { roleId, userId } = validatedParams<RoleAssignmentParams>(response);
		response.json({
			data: await this.deps.unassignRoleUseCase.execute(
				{ target: targetOf(response), actor: actorOf(response), roleId, userId },
				requestMeta(request),
			),
		});
	};
}
