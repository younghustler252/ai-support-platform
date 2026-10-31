import type { Request, Response } from "express";

import { authContext, requestMeta, validatedBody } from "../../auth/http/auth-http.js";
import { tenantContext } from "../../tenancy/http/tenant-http.js";
import type { ArchiveApplicationUseCase } from "../usecases/archive-application.usecase.js";
import type { CreateApplicationUseCase } from "../usecases/create-application.usecase.js";
import type { GetApplicationUseCase } from "../usecases/get-application.usecase.js";
import type { ListApplicationsUseCase } from "../usecases/list-applications.usecase.js";
import type { UpdateApplicationUseCase } from "../usecases/update-application.usecase.js";
import type { CreateApplicationInput, UpdateApplicationInput } from "../validators/application.validator.js";

interface Dependencies {
	createApplicationUseCase: CreateApplicationUseCase;
	listApplicationsUseCase: ListApplicationsUseCase;
	getApplicationUseCase: GetApplicationUseCase;
	updateApplicationUseCase: UpdateApplicationUseCase;
	archiveApplicationUseCase: ArchiveApplicationUseCase;
}

export class ApplicationController {
	constructor(private readonly deps: Dependencies) {}

	create = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId } = tenantContext(response);
		const input = validatedBody<CreateApplicationInput>(response);
		const application = await this.deps.createApplicationUseCase.execute(
			{ organizationId, actorId: user.id, ...input },
			requestMeta(request),
		);
		response.status(201).json({ data: { application } });
	};

	list = async (_request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, role } = tenantContext(response);
		response.json({
			data: { applications: await this.deps.listApplicationsUseCase.execute({ organizationId, userId: user.id, role }) },
		});
	};

	get = async (_request: Request, response: Response): Promise<void> => {
		const { organizationId, applicationId } = tenantContext(response);
		response.json({
			data: { application: await this.deps.getApplicationUseCase.execute(organizationId, applicationId as string) },
		});
	};

	update = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, applicationId } = tenantContext(response);
		const patch = validatedBody<UpdateApplicationInput>(response);
		const application = await this.deps.updateApplicationUseCase.execute(
			{ organizationId, applicationId: applicationId as string, actorId: user.id, patch },
			requestMeta(request),
		);
		response.json({ data: { application } });
	};

	archive = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, applicationId } = tenantContext(response);
		response.json({
			data: await this.deps.archiveApplicationUseCase.execute(
				{ organizationId, applicationId: applicationId as string, actorId: user.id },
				requestMeta(request),
			),
		});
	};
}
