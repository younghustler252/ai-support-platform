import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const newPassword = z.string().min(12).max(128);
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid token");

export const registerSchema = z.strictObject({
	email,
	password: newPassword,
	displayName: z.string().trim().min(1).max(100).optional(),
});
export const loginSchema = z.strictObject({ email, password: z.string().min(1).max(128) });
export const emailSchema = z.strictObject({ email });
export const tokenSchema = z.strictObject({ token });
export const resetSchema = z.strictObject({ token, password: newPassword });
export const changePasswordSchema = z.strictObject({
	currentPassword: z.string().min(1).max(128),
	newPassword,
}).refine((value) => value.currentPassword !== value.newPassword, {
	message: "New password must be different from the current password",
	path: ["newPassword"],
});
export const sessionParamsSchema = z.strictObject({ sessionId: z.uuid() });

export type RegisterInput = z.output<typeof registerSchema>;
export type LoginInput = z.output<typeof loginSchema>;
export type EmailInput = z.output<typeof emailSchema>;
export type TokenInput = z.output<typeof tokenSchema>;
export type ResetInput = z.output<typeof resetSchema>;
export type ChangePasswordInput = z.output<typeof changePasswordSchema>;
export type SessionParams = z.output<typeof sessionParamsSchema>;
