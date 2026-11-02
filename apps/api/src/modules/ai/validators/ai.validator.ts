import { z } from "zod";

import { tenancyConfig } from "../../../config/tenancy.js";

export const aiParamsSchema = z.object({ organizationId: z.uuid(), applicationId: z.uuid() });

export const updateAiSettingsSchema = z
	.strictObject({
		enabled: z.boolean().optional(),
		instructions: z.string().trim().max(tenancyConfig.ai.instructionsMaxLength).optional(),
		fallbackMessage: z.string().trim().min(1).max(tenancyConfig.ai.fallbackMessageMaxLength).nullable().optional(),
	})
	.refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const serviceAiParamsSchema = z.object({ conversationId: z.uuid() });

export type UpdateAiSettingsInput = z.output<typeof updateAiSettingsSchema>;
