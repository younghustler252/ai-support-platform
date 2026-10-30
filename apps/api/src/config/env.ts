import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

loadEnv({
	path: fileURLToPath(new URL("../../../../.env", import.meta.url)),
});

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
	PORT: z.coerce.number().int().positive().default(4000),
	CORS_ORIGINS: z.string().default("http://localhost:3000"),
	DATABASE_URL: z.string().min(1),
	AUTH_JWT_SECRET: z.string().min(32),
	AUTH_FRONTEND_URL: z.url().default("http://localhost:3000"),
	AUTH_EMAIL_API_KEY: z.string().optional(),
	AUTH_EMAIL_FROM: z.string().optional(),
});

export const env = envSchema.parse(process.env);
