import { ForbiddenError, NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditMetadata } from "../../audit/repositories/audit.repository.interface.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { EffectiveGrants } from "../../tenancy/tenancy.types.js";
import type { RoleTarget, RoleView } from "../rbac.types.js";
import type { IRoleRepository } from "../repositories/role.repository.interface.js";

export interface RoleActor {
	id: string;
	grants: EffectiveGrants;
}

export async function requireCustomRole(repository: IRoleRepository, target: RoleTarget, roleId: string): Promise<RoleView> {
	const role = await repository.find(target, roleId);
	if (!role) throw new NotFoundError("Role not found");
	if (role.system) throw new ForbiddenError("Default roles cannot be changed");
	return role;
}

export function roleAuditMetadata(target: RoleTarget, meta: RequestMeta, extra: AuditMetadata = {}): AuditMetadata {
	return auditMetadata(meta, {
		organizationId: target.organizationId,
		...(target.realm === "APPLICATION" ? { applicationId: target.applicationId } : {}),
		...extra,
	});
}
