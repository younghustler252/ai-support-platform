import type { Request, Response } from "express";

import { authContext, requestMeta, validatedBody } from "../../auth/http/auth-http.js";
import { tenantContext } from "../../tenancy/http/tenant-http.js";
import type { ArchiveOrganizationUseCase } from "../usecases/archive-organization.usecase.js";
import type { CreateOrganizationUseCase } from "../usecases/create-organization.usecase.js";
import type { GetOrganizationUseCase } from "../usecases/get-organization.usecase.js";
import type { ListOrganizationsUseCase } from "../usecases/list-organizations.usecase.js";
import type { UpdateOrganizationUseCase } from "../usecases/update-organization.usecase.js";
import type { CreateOrganizationInput, UpdateOrganizationInput } from "../validators/organization.validator.js";

interface Dependencies {
	createOrganizationUseCase: CreateOrganizationUseCase;
	listOrganizationsUseCase: ListOrganizationsUseCase;
	getOrganizationUseCase: GetOrganizationUseCase;
	updateOrganizationUseCase: UpdateOrganizationUseCase;
	archiveOrganizationUseCase: ArchiveOrganizationUseCase;
}

export class OrganizationController {
	constructor(private readonly deps: Dependencies) {}

	create = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { name, slug } = validatedBody<CreateOrganizationInput>(response);
		const organization = await this.deps.createOrganizationUseCase.execute({ userId: user.id, name, slug }, requestMeta(request));
		response.status(201).json({ data: { organization } });
	};

	list = async (_request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		response.json({ data: { organizations: await this.deps.listOrganizationsUseCase.execute(user.id) } });
	};

	get = async (_request: Request, response: Response): Promise<void> => {
		const { organizationId, role } = tenantContext(response);
		response.json({ data: { organization: await this.deps.getOrganizationUseCase.execute(organizationId, role) } });
	};

	update = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, role } = tenantContext(response);
		const { name } = validatedBody<UpdateOrganizationInput>(response);
		const organization = await this.deps.updateOrganizationUseCase.execute(
			{ organizationId, actorId: user.id, role, name },
			requestMeta(request),
		);
		response.json({ data: { organization } });
	};

	archive = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId } = tenantContext(response);
		response.json({
			data: await this.deps.archiveOrganizationUseCase.execute({ organizationId, actorId: user.id }, requestMeta(request)),
		});
	};
}
