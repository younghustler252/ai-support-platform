import { z } from "zod";

import { cursorSchema, limitSchema } from "../../../foundation/validation/fields.js";

export const notificationParamsSchema = z.object({ notificationId: z.uuid() });

export const listNotificationsQuerySchema = z.object({
	limit: limitSchema,
	cursor: cursorSchema,
	unread: z
		.enum(["true", "false"])
		.optional()
		.transform((value) => value === "true"),
});

export const updatePreferencesSchema = z.strictObject({ email: z.boolean() });

export type NotificationParams = z.output<typeof notificationParamsSchema>;
export type ListNotificationsQuery = z.output<typeof listNotificationsQuerySchema>;
export type UpdatePreferencesInput = z.output<typeof updatePreferencesSchema>;
