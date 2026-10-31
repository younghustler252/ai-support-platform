import { z } from "zod";

import { tenancyConfig } from "../../../config/tenancy.js";
import { originSchema, slugSchema } from "../../../foundation/validation/fields.js";

const name = z.string().trim().min(2).max(80);
const description = z.string().trim().max(500);
const allowedOrigins = z
	.array(originSchema)
	.max(tenancyConfig.limits.allowedOriginsPerApplication)
	.transform((origins) => [...new Set(origins)]);

export const createApplicationSchema = z.strictObject({
	name,
	slug: slugSchema.optional(),
	description: description.optional(),
	allowedOrigins: allowedOrigins.default([]),
});

export const updateApplicationSchema = z
	.strictObject({
		name: name.optional(),
		description: description.nullable().optional(),
		allowedOrigins: allowedOrigins.optional(),
	})
	.refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export type CreateApplicationInput = z.output<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.output<typeof updateApplicationSchema>;
