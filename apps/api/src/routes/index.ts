import { Router } from "express";
import type { AwilixContainer } from "awilix";
import { publicSettingsRouter } from "../modules/platform-settings/routes/public-settings.routes.js";
export function apiRouter(container: AwilixContainer): Router { const router = Router(); router.use("/platform", publicSettingsRouter(container)); return router; }
