import { z } from "zod";

import { cursorSchema, limitSchema } from "../../../foundation/validation/fields.js";

export const auditParamsSchema = z.object({ organizationId: z.uuid() });

export const listAuditLogsQuerySchema = z
	.object({
		limit: limitSchema,
		cursor: cursorSchema,
		applicationId: z.uuid().optional(),
		actorUserId: z.uuid().optional(),
		action: z
			.string()
			.trim()
			.min(1)
			.max(100)
			.regex(/^[a-z0-9_.-]+$/)
			.optional(),
		from: z.coerce.date().optional(),
		to: z.coerce.date().optional(),
	})
	.refine((value) => !value.from || !value.to || value.from <= value.to, { message: "from must not be after to", path: ["from"] });

export type AuditParams = z.output<typeof auditParamsSchema>;
export type ListAuditLogsQuery = z.output<typeof listAuditLogsQuerySchema>;
