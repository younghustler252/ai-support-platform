import { tenancyConfig } from "../../../config/tenancy.js";
import { ConflictError, LimitExceededError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { isUniqueViolation } from "../../auth/auth.utils.js";
import type { RoleTarget, RoleView } from "../rbac.types.js";
import type { IRoleRepository } from "../repositories/role.repository.interface.js";
import { assertHolds } from "../services/grant-guard.js";
import { resolveGrants, type PermissionRequest } from "../services/role-permissions.js";
import { roleAuditMetadata, type RoleActor } from "./role-usecase.shared.js";

interface Input {
	target: RoleTarget;
	actor: RoleActor;
	name: string;
	description?: string | null;
	permissions: PermissionRequest[];
}

export class CreateRoleUseCase {
	constructor(private readonly deps: { roleRepository: IRoleRepository; auditService: AuditRecorder }) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<RoleView> {
		const { roleRepository, auditService } = this.deps;

		const grants = resolveGrants(input.target, input.permissions);
		assertHolds(input.actor.grants, grants);

		if ((await roleRepository.countCustom(input.target)) >= tenancyConfig.limits.customRolesPerScope) {
			throw new LimitExceededError("Role limit reached; delete an unused role first");
		}

		try {
			const role = await roleRepository.create(input.target, {
				name: input.name,
				description: input.description ?? null,
				permissions: grants,
				actorId: input.actor.id,
			});
			await auditService.record({
				actorUserId: input.actor.id,
				action: "role.created",
				resourceType: "Role",
				resourceId: role.id,
				metadata: roleAuditMetadata(input.target, meta, { name: role.name, permissions: grants.map((grant) => grant.code).join(",") }),
			});
			return role;
		} catch (error) {
			if (isUniqueViolation(error)) throw new ConflictError("A role with this name already exists");
			throw error;
		}
	}
}
