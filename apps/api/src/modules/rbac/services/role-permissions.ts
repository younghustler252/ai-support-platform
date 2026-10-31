import { ValidationError } from "../../../foundation/errors/app-error.js";
import type { RoleGrant } from "../../tenancy/tenancy.types.js";
import { findPermission, grantScopeFor } from "../permission-catalog.js";
import type { RoleTarget } from "../rbac.types.js";

export function resolveGrants(target: RoleTarget, codes: readonly string[]): RoleGrant[] {
	const unknown: string[] = [];
	const unavailable: string[] = [];
	const grants: RoleGrant[] = [];

	for (const code of new Set(codes)) {
		const definition = findPermission(code);
		if (!definition) {
			unknown.push(code);
			continue;
		}
		const scope = grantScopeFor(target.realm, definition);
		if (!definition.delegable || !scope) {
			unavailable.push(code);
			continue;
		}
		grants.push({ code, scope });
	}

	if (unknown.length > 0) throw new ValidationError(`Unknown permissions: ${unknown.join(", ")}`);
	if (unavailable.length > 0) {
		throw new ValidationError(`These permissions cannot be granted by a ${target.realm.toLowerCase()} role: ${unavailable.join(", ")}`);
	}
	return grants.sort((first, second) => first.code.localeCompare(second.code));
}
