import { z } from "zod";

import { tenancyConfig } from "../../../config/tenancy.js";
import { cursorSchema, limitSchema } from "../../../foundation/validation/fields.js";
import { urlProblem, webhookEvents } from "../domain/webhook-domain.js";

const url = z
	.string()
	.trim()
	.max(tenancyConfig.webhooks.urlMaxLength)
	.superRefine((value, context) => {
		const problem = urlProblem(value);
		if (problem) context.addIssue({ code: "custom", message: problem });
	});

const events = z
	.array(z.enum(webhookEvents))
	.min(1)
	.max(webhookEvents.length)
	.transform((value) => [...new Set(value)]);

const description = z.string().trim().min(1).max(200);

export const webhookParamsSchema = z.object({
	organizationId: z.uuid(),
	applicationId: z.uuid(),
	endpointId: z.uuid(),
});

export const deliveryParamsSchema = webhookParamsSchema.extend({ deliveryId: z.uuid() });

export const createWebhookSchema = z.strictObject({ url, events, description: description.optional() });

export const updateWebhookSchema = z
	.strictObject({ url: url.optional(), events: events.optional(), description: description.nullable().optional(), enabled: z.boolean().optional() })
	.refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const listDeliveriesQuerySchema = z.object({ limit: limitSchema, cursor: cursorSchema });

export type WebhookParams = z.output<typeof webhookParamsSchema>;
export type DeliveryParams = z.output<typeof deliveryParamsSchema>;
export type CreateWebhookInput = z.output<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.output<typeof updateWebhookSchema>;
export type ListDeliveriesQuery = z.output<typeof listDeliveriesQuerySchema>;
