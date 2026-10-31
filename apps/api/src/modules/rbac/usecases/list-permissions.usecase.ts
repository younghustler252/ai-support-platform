import { grantScopeFor, permissionCatalog, type PermissionDefinition } from "../permission-catalog.js";
import type { RoleTarget } from "../rbac.types.js";

export interface PermissionView {
	code: string;
	description: string;
	realm: PermissionDefinition["realm"];
	scope: string;
}

export class ListPermissionsUseCase {
	execute(target: RoleTarget): PermissionView[] {
		return permissionCatalog.flatMap((definition) => {
			const scope = grantScopeFor(target.realm, definition);
			if (!definition.delegable || !scope) return [];
			return [{ code: definition.code, description: definition.description, realm: definition.realm, scope }];
		});
	}
}
