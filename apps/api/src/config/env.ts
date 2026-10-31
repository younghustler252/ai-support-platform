import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

loadEnv({
	path: fileURLToPath(new URL("../../../../.env", import.meta.url)),
});

const positive = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
	PORT: positive(4000),
	CORS_ORIGINS: z.string().default("http://localhost:3000"),
	TRUST_PROXY: z.string().default("false"),
	DATABASE_URL: z.string().min(1),
	AUTH_JWT_SECRET: z.string().min(32),
	AUTH_JWT_PREVIOUS_SECRET: z.string().min(32).optional(),
	AUTH_JWT_ISSUER: z.string().min(1).default("support-api"),
	AUTH_JWT_AUDIENCE: z.string().min(1).default("support-clients"),
	AUTH_FRONTEND_URL: z.url().default("http://localhost:3000"),
	AUTH_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_]+$/).default("refresh_token"),
	AUTH_COOKIE_DOMAIN: z.string().optional(),
	AUTH_ACCESS_TTL_SECONDS: positive(900),
	AUTH_REFRESH_TTL_DAYS: positive(7),
	AUTH_SESSION_MAX_DAYS: positive(30),
	AUTH_VERIFY_TTL_HOURS: positive(24),
	AUTH_RESET_TTL_MINUTES: positive(60),
	AUTH_REFRESH_GRACE_SECONDS: z.coerce.number().int().nonnegative().default(10),
	AUTH_MAX_ACTIVE_SESSIONS: positive(10),
	AUTH_EMAIL_API_KEY: z.string().optional(),
	AUTH_EMAIL_FROM: z.string().optional(),
}).superRefine((value, context) => {
	if (value.AUTH_REFRESH_TTL_DAYS > value.AUTH_SESSION_MAX_DAYS) {
		context.addIssue({
			code: "custom",
			path: ["AUTH_REFRESH_TTL_DAYS"],
			message: "AUTH_REFRESH_TTL_DAYS must not exceed AUTH_SESSION_MAX_DAYS",
		});
	}
	if (value.NODE_ENV !== "production") return;
	for (const key of ["AUTH_EMAIL_API_KEY", "AUTH_EMAIL_FROM"] as const) {
		if (!value[key]) {
			context.addIssue({ code: "custom", path: [key], message: `${key} is required in production` });
		}
	}
	if (!value.AUTH_FRONTEND_URL.startsWith("https://")) {
		context.addIssue({ code: "custom", path: ["AUTH_FRONTEND_URL"], message: "AUTH_FRONTEND_URL must use https in production" });
	}
	if (value.CORS_ORIGINS.split(",").some((origin) => origin.trim() === "*" || origin.trim().startsWith("http://"))) {
		context.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "CORS_ORIGINS must list explicit https origins in production" });
	}
});

function withoutEmptyValues(source: NodeJS.ProcessEnv): Record<string, string> {
	return Object.fromEntries(
		Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== ""),
	);
}

function parseTrustProxy(value: string): boolean | number | string {
	if (value === "true") return true;
	if (value === "false") return false;
	if (/^\d+$/.test(value)) return Number(value);
	return value;
}

export const env = envSchema.parse(withoutEmptyValues(process.env));

export const corsOrigins: readonly string[] = env.CORS_ORIGINS
	.split(",")
	.map((origin) => origin.trim().replace(/\/+$/, ""))
	.filter((origin) => origin.length > 0);

export const trustProxy = parseTrustProxy(env.TRUST_PROXY);
