import { Router } from "express";
import type { AwilixContainer } from "awilix";

import { authRouter } from "../modules/auth/routes/auth.routes.js";
import { publicSettingsRouter } from "../modules/platform-settings/routes/public-settings.routes.js";

export function apiRouter(container: AwilixContainer): Router {
	const router = Router();

	router.use("/platform", publicSettingsRouter(container));
	router.use("/auth", authRouter());

	return router;
}
