import { z } from "zod";

export const registerSchema = z.strictObject({
	email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
	password: z.string().min(12).max(128),
	displayName: z.string().trim().min(1).max(100).optional(),
});

export type RegisterInput = z.output<typeof registerSchema>;

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const token = z.string().min(20).max(512);
export const loginSchema = z.strictObject({ email, password: z.string().min(1) });
export const emailSchema = z.strictObject({ email });
export const tokenSchema = z.strictObject({ token });
export const resetSchema = z.strictObject({ token, password: z.string().min(12).max(128) });
export type LoginInput = z.output<typeof loginSchema>;
export type EmailInput = z.output<typeof emailSchema>;
export type TokenInput = z.output<typeof tokenSchema>;
export type ResetInput = z.output<typeof resetSchema>;
