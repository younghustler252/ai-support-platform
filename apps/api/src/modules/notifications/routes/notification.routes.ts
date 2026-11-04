import { Router } from "express";

import { tenancyConfig } from "../../../config/tenancy.js";
import { delegate } from "../../../foundation/http/locals.js";
import { rateLimit } from "../../../foundation/middleware/rate-limit.js";
import { validateBody, validateParams, validateQuery } from "../../../foundation/validation/validate.js";
import { requireAuth } from "../../auth/middleware/require-auth.js";
import { userRateKey } from "../../tenancy/http/tenant-http.js";
import type { NotificationController } from "../controllers/notification.controller.js";
import { listNotificationsQuerySchema, notificationParamsSchema, updatePreferencesSchema } from "../validators/notification.validator.js";

const handle = (method: Parameters<typeof delegate<NotificationController>>[1]) =>
	delegate<NotificationController>("notificationController", method);

const limit = rateLimit({ name: "notifications:user", ...tenancyConfig.rateLimits.notifications, key: userRateKey });

export function notificationRouter(): Router {
	const router = Router();
	router.get("/me/notifications", requireAuth, limit, validateQuery(listNotificationsQuerySchema), handle("list"));
	router.post("/me/notifications/read-all", requireAuth, limit, handle("markAllRead"));
	router.post("/me/notifications/:notificationId/read", requireAuth, limit, validateParams(notificationParamsSchema), handle("markRead"));
	router.get("/me/notification-preferences", requireAuth, limit, handle("getPreferences"));
	router.put("/me/notification-preferences", requireAuth, limit, validateBody(updatePreferencesSchema), handle("updatePreferences"));
	return router;
}
