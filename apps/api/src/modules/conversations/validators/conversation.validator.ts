import { z } from "zod";

import { tenancyConfig } from "../../../config/tenancy.js";
import { cursorSchema, limitSchema } from "../../../foundation/validation/fields.js";
import { externalIdSchema } from "../../customers/validators/customer.validator.js";

const statuses = ["AI_ACTIVE", "WAITING_FOR_AGENT", "ASSIGNED_TO_AGENT", "RESOLVED", "CLOSED"] as const;
const body = z.string().trim().min(1).max(tenancyConfig.messageBodyMaxLength);

const statusList = z
	.string()
	.trim()
	.transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean))
	.pipe(z.array(z.enum(statuses)).min(1).max(statuses.length));

export const listConversationsQuerySchema = z.object({
	status: statusList.optional(),
	assignee: z.union([z.literal("me"), z.literal("unassigned"), z.uuid()]).optional(),
	customerId: z.uuid().optional(),
	limit: limitSchema,
	cursor: cursorSchema,
});

export const listMessagesQuerySchema = z.object({ limit: limitSchema, cursor: cursorSchema });

export const conversationParamsSchema = z.object({
	organizationId: z.uuid(),
	applicationId: z.uuid(),
	conversationId: z.uuid(),
});

export const sendMessageSchema = z.strictObject({ body, internal: z.boolean().default(false) });
export const assignConversationSchema = z.strictObject({ userId: z.uuid() });
export const transferConversationSchema = z.strictObject({ userId: z.uuid(), note: z.string().trim().min(1).max(500).optional() });

export const serviceConversationParamsSchema = z.object({ conversationId: z.uuid() });
export const startConversationSchema = z.strictObject({
	customer: z.strictObject({
		externalId: externalIdSchema,
		displayName: z.string().trim().min(1).max(120).optional(),
		email: z.string().trim().toLowerCase().pipe(z.email().max(254)).optional(),
	}),
	subject: z.string().trim().min(1).max(200).optional(),
	message: body,
});
export const customerMessageSchema = z.strictObject({ body });

export type ListConversationsQuery = z.output<typeof listConversationsQuerySchema>;
export type ListMessagesQuery = z.output<typeof listMessagesQuerySchema>;
export type ConversationParams = z.output<typeof conversationParamsSchema>;
export type SendMessageInput = z.output<typeof sendMessageSchema>;
export type AssignConversationInput = z.output<typeof assignConversationSchema>;
export type TransferConversationInput = z.output<typeof transferConversationSchema>;
export type StartConversationInput = z.output<typeof startConversationSchema>;
export type CustomerMessageInput = z.output<typeof customerMessageSchema>;
