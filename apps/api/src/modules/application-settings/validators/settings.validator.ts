import { z } from "zod";

import { tenancyConfig } from "../../../config/tenancy.js";

function validTimezone(value: string): boolean {
	try {
		new Intl.DateTimeFormat("en", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

const widgetSchema = z
	.strictObject({
		title: z.string().trim().min(1).max(tenancyConfig.settings.titleMaxLength).nullable().optional(),
		welcomeMessage: z.string().trim().min(1).max(tenancyConfig.settings.welcomeMessageMaxLength).nullable().optional(),
		primaryColor: z
			.string()
			.regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour such as #1a73e8")
			.transform((value) => value.toLowerCase())
			.optional(),
		position: z.enum(["left", "right"]).optional(),
	})
	.refine((value) => Object.keys(value).length > 0, "Provide at least one widget field");

export const settingsParamsSchema = z.object({ organizationId: z.uuid(), applicationId: z.uuid() });

export const updateSettingsSchema = z
	.strictObject({
		timezone: z.string().trim().min(1).max(64).refine(validTimezone, "Must be a valid IANA timezone").optional(),
		widget: widgetSchema.optional(),
	})
	.refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export type UpdateSettingsInput = z.output<typeof updateSettingsSchema>;
