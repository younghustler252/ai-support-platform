import { findPermission, permissionCatalog, widestScope } from "../../rbac/permission-catalog.js";
import { applicationPolicy, atLeast, organizationPolicy } from "../policies.js";
import type { EffectiveGrants, GrantScope, RoleGrant, TenantRole } from "../tenancy.types.js";

function merge(target: Record<string, GrantScope>, code: string, scope: GrantScope): void {
	target[code] = widestScope(target[code], scope) as GrantScope;
}

function addCustom(target: Record<string, GrantScope>, grants: readonly RoleGrant[], realm: "ORGANIZATION" | "APPLICATION" | null): void {
	for (const grant of grants) {
		const definition = findPermission(grant.code);
		if (!definition) continue;
		if (realm && definition.realm !== realm) continue;
		merge(target, grant.code, grant.scope);
	}
}

export function organizationGrants(role: TenantRole, custom: readonly RoleGrant[]): EffectiveGrants {
	const result: Record<string, GrantScope> = {};

	for (const [code, minimum] of Object.entries(organizationPolicy)) {
		if (atLeast(role, minimum)) merge(result, code, "ORGANIZATION");
	}
	if (atLeast(role, "ADMIN")) {
		for (const [code, rule] of Object.entries(applicationPolicy)) {
			if (atLeast(role, rule.minimum)) merge(result, code, "ORGANIZATION");
		}
	}
	addCustom(result, custom, null);
	return result;
}

export function applicationGrants(input: {
	organizationRole: TenantRole;
	organizationCustom: readonly RoleGrant[];
	applicationRole: TenantRole | null;
	applicationCustom: readonly RoleGrant[];
}): EffectiveGrants {
	const result: Record<string, GrantScope> = {};

	const fromOrganization = organizationGrants(input.organizationRole, input.organizationCustom);
	for (const definition of permissionCatalog) {
		const scope = fromOrganization[definition.code];
		if (definition.realm === "APPLICATION" && scope) merge(result, definition.code, scope);
	}

	if (input.applicationRole) {
		for (const [code, rule] of Object.entries(applicationPolicy)) {
			const organizationLevel = "organizationLevel" in rule && rule.organizationLevel === true;
			if (!organizationLevel && atLeast(input.applicationRole, rule.minimum)) merge(result, code, "APPLICATION");
		}
		addCustom(result, input.applicationCustom, "APPLICATION");
	}
	return result;
}
