import { LimitExceededError, NotFoundError } from "../../../foundation/errors/app-error.js";
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

export class AssignRoleUseCase {
	constructor(private readonly deps: { roleRepository: IRoleRepository; auditService: AuditRecorder }) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<{ assigned: true }> {
		const { roleRepository, auditService } = this.deps;

		const role = await requireCustomRole(roleRepository, input.target, input.roleId);
		assertHolds(input.actor.grants, role.permissions);

		const result = await roleRepository.assign(input.target, { roleId: input.roleId, userId: input.userId, actorId: input.actor.id });
		if (result === "role-missing") throw new NotFoundError("Role not found");
		if (result === "not-member") throw new NotFoundError("Member not found");
		if (result === "limit") throw new LimitExceededError("This member already has the maximum number of roles");

		if (result === "assigned") {
			await auditService.record({
				actorUserId: input.actor.id,
				action: "role.assigned",
				resourceType: "Role",
				resourceId: role.id,
				metadata: roleAuditMetadata(input.target, meta, { targetUserId: input.userId, name: role.name }),
			});
		}
		return { assigned: true };
	}
}
