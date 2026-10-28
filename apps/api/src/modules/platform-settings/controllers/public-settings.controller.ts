import type { Request, Response } from "express";

import type { PublicSettingsService } from "../services/public-settings.service.js";

interface PublicSettingsDependencies {
	publicSettingsService: PublicSettingsService;
}

export class PublicSettingsController {
	constructor(private readonly deps: PublicSettingsDependencies) {}

	get = (_request: Request, response: Response): void => {
		response.json({
			data: this.deps.publicSettingsService.getPublicSettings(),
		});
	};
}
