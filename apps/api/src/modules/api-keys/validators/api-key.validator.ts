import { z } from "zod";

import { apiKeyScopes, tenancyConfig } from "../../../config/tenancy.js";

const MAX_EXPIRY_MS = 2 * 365 * 24 * 3_600_000;

const expiresAt = z.iso
	.datetime({ offset: true })
	.transform((value) => new Date(value))
	.refine((date) => date.getTime() > Date.now(), "Expiry must be in the future")
	.refine((date) => date.getTime() <= Date.now() + MAX_EXPIRY_MS, "Expiry must be within two years");

export const createApiKeySchema = z.strictObject({
	name: z.string().trim().min(1).max(80),
	scopes: z
		.array(z.enum(apiKeyScopes))
		.min(1)
		.max(apiKeyScopes.length)
		.transform((scopes) => [...new Set(scopes)]),
	expiresAt: expiresAt.optional(),
});

export const rotateApiKeySchema = z.preprocess(
	(value) => value ?? {},
	z.strictObject({
		graceHours: z.number().int().min(0).max(tenancyConfig.apiKey.maxRotationGraceHours).default(tenancyConfig.apiKey.defaultRotationGraceHours),
	}),
);

export const apiKeyParamsSchema = z.object({
	organizationId: z.uuid(),
	applicationId: z.uuid(),
	keyId: z.uuid(),
});

export type CreateApiKeyInput = z.output<typeof createApiKeySchema>;
export type RotateApiKeyInput = z.output<typeof rotateApiKeySchema>;
export type ApiKeyParams = z.output<typeof apiKeyParamsSchema>;
