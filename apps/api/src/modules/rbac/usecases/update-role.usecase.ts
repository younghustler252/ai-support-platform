import { ConflictError, NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { isUniqueViolation } from "../../auth/auth.utils.js";
import type { RoleTarget, RoleView } from "../rbac.types.js";
import type { IRoleRepository } from "../repositories/role.repository.interface.js";
import { assertHolds } from "../services/grant-guard.js";
import { resolveGrants } from "../services/role-permissions.js";
import { requireCustomRole, roleAuditMetadata, type RoleActor } from "./role-usecase.shared.js";

interface Input {
	target: RoleTarget;
	actor: RoleActor;
	roleId: string;
	patch: { name?: string; description?: string | null; permissions?: string[] };
}

export class UpdateRoleUseCase {
	constructor(private readonly deps: { roleRepository: IRoleRepository; auditService: AuditRecorder }) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<RoleView> {
		const { roleRepository, auditService } = this.deps;

		const current = await requireCustomRole(roleRepository, input.target, input.roleId);
		assertHolds(input.actor.grants, current.permissions);

		const grants = input.patch.permissions ? resolveGrants(input.target, input.patch.permissions) : undefined;
		if (grants) assertHolds(input.actor.grants, grants);

		try {
			const role = await roleRepository.update(input.target, input.roleId, {
				name: input.patch.name,
				description: input.patch.description,
				permissions: grants,
			});
			if (!role) throw new NotFoundError("Role not found");

			await auditService.record({
				actorUserId: input.actor.id,
				action: "role.updated",
				resourceType: "Role",
				resourceId: role.id,
				metadata: roleAuditMetadata(input.target, meta, {
					name: role.name,
					permissions: role.permissions.map((grant) => grant.code).join(","),
				}),
			});
			return role;
		} catch (error) {
			if (isUniqueViolation(error)) throw new ConflictError("A role with this name already exists");
			throw error;
		}
	}
}
