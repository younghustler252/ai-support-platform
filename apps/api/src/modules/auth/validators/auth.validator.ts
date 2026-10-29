import { z } from "zod";

export const registerSchema = z.strictObject({
	email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
	password: z.string().min(12).max(128),
	displayName: z.string().trim().min(1).max(100).optional(),
});

export type RegisterInput = z.output<typeof registerSchema>;
