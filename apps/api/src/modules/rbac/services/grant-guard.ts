import { ForbiddenError } from "../../../foundation/errors/app-error.js";
import type { EffectiveGrants, RoleGrant } from "../../tenancy/tenancy.types.js";
import { scopeCovers } from "../permission-catalog.js";

export function assertHolds(actor: EffectiveGrants, requested: readonly RoleGrant[]): void {
	const missing = requested.filter((grant) => !scopeCovers(actor[grant.code], grant.scope)).map((grant) => grant.code);
	if (missing.length > 0) {
		throw new ForbiddenError(`You cannot manage permissions you do not hold: ${[...new Set(missing)].sort().join(", ")}`);
	}
}
