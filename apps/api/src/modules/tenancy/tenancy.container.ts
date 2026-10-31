import { asClass, type AwilixContainer } from "awilix";

import { AccessRepositoryImpl } from "./repositories/access.repository.impl.js";
import { RoleAuthorizer } from "./services/authorizer.service.js";

export function registerTenancy(container: AwilixContainer): void {
	container.register({
		accessRepository: asClass(AccessRepositoryImpl).scoped(),
		authorizer: asClass(RoleAuthorizer).scoped(),
	});
}
