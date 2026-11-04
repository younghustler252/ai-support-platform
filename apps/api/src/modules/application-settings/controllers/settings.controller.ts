import type { Request, Response } from "express";

import { apiKeyContext } from "../../api-keys/middleware/require-api-key.js";
import { authContext, requestMeta, validatedBody } from "../../auth/http/auth-http.js";
import { tenantContext } from "../../tenancy/http/tenant-http.js";
import type { GetApplicationSettingsUseCase, GetWidgetConfigUseCase, UpdateApplicationSettingsUseCase } from "../usecases/settings-usecases.js";
import type { UpdateSettingsInput } from "../validators/settings.validator.js";

interface Dependencies {
	getApplicationSettingsUseCase: GetApplicationSettingsUseCase;
	updateApplicationSettingsUseCase: UpdateApplicationSettingsUseCase;
	getWidgetConfigUseCase: GetWidgetConfigUseCase;
}

export class SettingsController {
	constructor(private readonly deps: Dependencies) {}

	get = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		response.json({ data: { settings: await this.deps.getApplicationSettingsUseCase.execute(applicationId as string) } });
	};

	update = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, applicationId } = tenantContext(response);
		const patch = validatedBody<UpdateSettingsInput>(response);
		const settings = await this.deps.updateApplicationSettingsUseCase.execute(
			{ organizationId, applicationId: applicationId as string, actorId: user.id, patch },
			requestMeta(request),
		);
		response.json({ data: { settings } });
	};

	widgetConfig = async (_request: Request, response: Response): Promise<void> => {
		const { application } = apiKeyContext(response);
		response.json({ data: { widget: await this.deps.getWidgetConfigUseCase.execute(application) } });
	};
}
