import { z } from "zod";

import { cursorSchema, limitSchema, metadataSchema } from "../../../foundation/validation/fields.js";

const displayName = z.string().trim().min(1).max(120);
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const externalIdSchema = z
	.string()
	.trim()
	.min(1)
	.max(128)
	.regex(/^[^\u0000-\u001f\u007f]+$/, "Contains control characters");

export const listCustomersQuerySchema = z.object({
	q: z.string().trim().min(1).max(100).optional(),
	limit: limitSchema,
	cursor: cursorSchema,
});

export const customerParamsSchema = z.object({
	organizationId: z.uuid(),
	applicationId: z.uuid(),
	customerId: z.uuid(),
});

export const updateCustomerSchema = z
	.strictObject({
		displayName: displayName.nullable().optional(),
		email: email.nullable().optional(),
		metadata: metadataSchema.optional(),
	})
	.refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const upsertServiceCustomerSchema = z.strictObject({
	displayName: displayName.optional(),
	email: email.optional(),
	metadata: metadataSchema.optional(),
});

export const serviceCustomerParamsSchema = z.object({ externalId: externalIdSchema });

export type ListCustomersQuery = z.output<typeof listCustomersQuerySchema>;
export type CustomerParams = z.output<typeof customerParamsSchema>;
export type UpdateCustomerInput = z.output<typeof updateCustomerSchema>;
export type UpsertServiceCustomerInput = z.output<typeof upsertServiceCustomerSchema>;
