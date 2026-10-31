import { z } from "zod";

import { slugSchema } from "../../../foundation/validation/fields.js";

const name = z.string().trim().min(2).max(80);

export const createOrganizationSchema = z.strictObject({ name, slug: slugSchema.optional() });
export const updateOrganizationSchema = z.strictObject({ name });

export type CreateOrganizationInput = z.output<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.output<typeof updateOrganizationSchema>;
