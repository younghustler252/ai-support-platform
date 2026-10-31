import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import type { RoleTarget } from "../rbac.types.js";
import type { IRoleRepository } from "../repositories/role.repository.interface.js";
import { assertHolds } from "../services/grant-guard.js";
import { requireCustomRole, roleAuditMetadata, type RoleActor } from "./role-usecase.shared.js";

interface Input {
	target: RoleTarget;
	actor: RoleActor;
	roleId: string;
	userId: string;
}

export class UnassignRoleUseCase {
	constructor(private readonly deps: { roleRepository: IRoleRepository; auditService: AuditRecorder }) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<{ unassigned: true }> {
		const { roleRepository, auditService } = this.deps;

		const role = await requireCustomRole(roleRepository, input.target, input.roleId);
		assertHolds(input.actor.grants, role.permissions);
		if (!(await roleRepository.unassign(input.target, input.roleId, input.userId))) {
			throw new NotFoundError("Role assignment not found");
		}

		await auditService.record({
			actorUserId: input.actor.id,
			action: "role.unassigned",
			resourceType: "Role",
			resourceId: role.id,
			metadata: roleAuditMetadata(input.target, meta, { targetUserId: input.userId, name: role.name }),
		});
		return { unassigned: true };
	}
}
