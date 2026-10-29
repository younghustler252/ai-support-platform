import { Router } from "express";
import type { AwilixContainer } from "awilix";

import type { PublicSettingsController } from "../controllers/public-settings.controller.js";

export function publicSettingsRouter(_container: AwilixContainer): Router {
	const router = Router();

	router.get("/public-settings", (request, response, next) => {
		try {
			const scope = response.locals.scope as AwilixContainer;
			const controller = scope.resolve<PublicSettingsController>(
				"publicSettingsController",
			);

			controller.get(request, response);
		} catch (error) {
			next(error);
		}
	});

	return router;
}
