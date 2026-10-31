import { asClass, type AwilixContainer } from "awilix";

import { OrganizationController } from "./controllers/organization.controller.js";
import { OrganizationRepositoryImpl } from "./repositories/organization.repository.impl.js";
import { ArchiveOrganizationUseCase } from "./usecases/archive-organization.usecase.js";
import { CreateOrganizationUseCase } from "./usecases/create-organization.usecase.js";
import { GetOrganizationUseCase } from "./usecases/get-organization.usecase.js";
import { ListOrganizationsUseCase } from "./usecases/list-organizations.usecase.js";
import { UpdateOrganizationUseCase } from "./usecases/update-organization.usecase.js";

export function registerOrganizations(container: AwilixContainer): void {
	container.register({
		organizationRepository: asClass(OrganizationRepositoryImpl).scoped(),
		createOrganizationUseCase: asClass(CreateOrganizationUseCase).scoped(),
		listOrganizationsUseCase: asClass(ListOrganizationsUseCase).scoped(),
		getOrganizationUseCase: asClass(GetOrganizationUseCase).scoped(),
		updateOrganizationUseCase: asClass(UpdateOrganizationUseCase).scoped(),
		archiveOrganizationUseCase: asClass(ArchiveOrganizationUseCase).scoped(),
		organizationController: asClass(OrganizationController).scoped(),
	});
}
