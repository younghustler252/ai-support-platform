import { Router } from "express";
import type { AwilixContainer } from "awilix";
import type { PublicSettingsController } from "../controllers/public-settings.controller.js";
export function publicSettingsRouter(container: AwilixContainer): Router { const router = Router(); router.get("/public-settings", async (req, res, next) => { const scope = container.createScope(); try { const controller = scope.resolve<PublicSettingsController>("publicSettingsController"); controller.get(req, res); } catch (error) { next(error); } finally { await scope.dispose(); } }); return router; }
