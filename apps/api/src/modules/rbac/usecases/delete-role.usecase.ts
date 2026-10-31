import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import type { RoleTarget } from "../rbac.types.js";
import type { IRoleRepository } from "../repositories/role.repository.interface.js";
import { assertHolds } from "../services/grant-guard.js";
import { requireCustomRole, roleAuditMetadata, type RoleActor } from "./role-usecase.shared.js";

export class DeleteRoleUseCase {
	constructor(private readonly deps: { roleRepository: IRoleRepository; auditService: AuditRecorder }) {}

	async execute(input: { target: RoleTarget; actor: RoleActor; roleId: string }, meta: RequestMeta = {}): Promise<{ deleted: true }> {
		const { roleRepository, auditService } = this.deps;

		const role = await requireCustomRole(roleRepository, input.target, input.roleId);
		assertHolds(input.actor.grants, role.permissions);
		if (!(await roleRepository.remove(input.target, input.roleId))) throw new NotFoundError("Role not found");

		await auditService.record({
			actorUserId: input.actor.id,
			action: "role.deleted",
			resourceType: "Role",
			resourceId: role.id,
			metadata: roleAuditMetadata(input.target, meta, { name: role.name, assigned: role.assignedCount }),
		});
		return { deleted: true };
	}
}
