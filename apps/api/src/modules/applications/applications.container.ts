import { asClass, type AwilixContainer } from "awilix";

import { ApplicationController } from "./controllers/application.controller.js";
import { ApplicationRepositoryImpl } from "./repositories/application.repository.impl.js";
import { ArchiveApplicationUseCase } from "./usecases/archive-application.usecase.js";
import { CreateApplicationUseCase } from "./usecases/create-application.usecase.js";
import { GetApplicationUseCase } from "./usecases/get-application.usecase.js";
import { ListApplicationsUseCase } from "./usecases/list-applications.usecase.js";
import { UpdateApplicationUseCase } from "./usecases/update-application.usecase.js";

export function registerApplications(container: AwilixContainer): void {
	container.register({
		applicationRepository: asClass(ApplicationRepositoryImpl).scoped(),
		createApplicationUseCase: asClass(CreateApplicationUseCase).scoped(),
		listApplicationsUseCase: asClass(ListApplicationsUseCase).scoped(),
		getApplicationUseCase: asClass(GetApplicationUseCase).scoped(),
		updateApplicationUseCase: asClass(UpdateApplicationUseCase).scoped(),
		archiveApplicationUseCase: asClass(ArchiveApplicationUseCase).scoped(),
		applicationController: asClass(ApplicationController).scoped(),
	});
}
