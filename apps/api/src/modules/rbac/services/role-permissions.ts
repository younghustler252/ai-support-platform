import { ValidationError } from "../../../foundation/errors/app-error.js";
import type { RoleGrant } from "../../tenancy/tenancy.types.js";
import { findPermission, grantScopeFor, widestScope, type PermissionScopeName } from "../permission-catalog.js";
import type { RoleTarget } from "../rbac.types.js";

export type PermissionRequest = string | { code: string; scope?: PermissionScopeName };

export function resolveGrants(target: RoleTarget, requests: readonly PermissionRequest[]): RoleGrant[] {
	const unknown: string[] = [];
	const unavailable: string[] = [];
	const resolved = new Map<string, PermissionScopeName>();

	for (const request of requests) {
		const code = typeof request === "string" ? request : request.code;
		const requestedScope = typeof request === "string" ? undefined : request.scope;
		const definition = findPermission(code);
		if (!definition) {
			unknown.push(code);
			continue;
		}
		const scope = definition.delegable ? grantScopeFor(target.realm, definition, requestedScope) : null;
		if (!scope) {
			unavailable.push(requestedScope ? `${code}@${requestedScope}` : code);
			continue;
		}
		resolved.set(code, widestScope(resolved.get(code), scope) as PermissionScopeName);
	}

	if (unknown.length > 0) throw new ValidationError(`Unknown permissions: ${unknown.join(", ")}`);
	if (unavailable.length > 0) {
		throw new ValidationError(`These permissions cannot be granted by a ${target.realm.toLowerCase()} role: ${unavailable.join(", ")}`);
	}
	return [...resolved.entries()]
		.map(([code, scope]) => ({ code, scope }))
		.sort((first, second) => first.code.localeCompare(second.code));
}
