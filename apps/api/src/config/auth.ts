import { env } from "./env.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const authConfig = {
	jwt: {
		issuer: env.AUTH_JWT_ISSUER,
		audience: env.AUTH_JWT_AUDIENCE,
		secret: env.AUTH_JWT_SECRET,
		previousSecret: env.AUTH_JWT_PREVIOUS_SECRET,
	},
	accessTtlSeconds: env.AUTH_ACCESS_TTL_SECONDS,
	refreshTtlMs: env.AUTH_REFRESH_TTL_DAYS * DAY,
	sessionMaxMs: env.AUTH_SESSION_MAX_DAYS * DAY,
	verifyTtlMs: env.AUTH_VERIFY_TTL_HOURS * HOUR,
	resetTtlMs: env.AUTH_RESET_TTL_MINUTES * MINUTE,
	refreshGraceMs: env.AUTH_REFRESH_GRACE_SECONDS * SECOND,
	resendCooldownMs: MINUTE,
	maxActiveSessions: env.AUTH_MAX_ACTIVE_SESSIONS,
	retentionMs: DAY,
	maintenanceIntervalMs: HOUR,
	frontendUrl: env.AUTH_FRONTEND_URL,
	cookie: {
		name: env.NODE_ENV === "production" ? `__Secure-${env.AUTH_COOKIE_NAME}` : env.AUTH_COOKIE_NAME,
		secure: env.NODE_ENV === "production",
		sameSite: "lax" as const,
		path: "/api/v1/auth",
		domain: env.AUTH_COOKIE_DOMAIN,
	},
	rateLimits: {
		registerIp: { limit: 10, windowMs: HOUR },
		loginIp: { limit: 30, windowMs: 15 * MINUTE },
		loginAccount: { limit: 10, windowMs: 15 * MINUTE },
		tokenRequestIp: { limit: 10, windowMs: 15 * MINUTE },
		tokenRequestEmail: { limit: 3, windowMs: HOUR },
		tokenSubmitIp: { limit: 20, windowMs: 15 * MINUTE },
		refreshIp: { limit: 120, windowMs: 15 * MINUTE },
		changePassword: { limit: 5, windowMs: 15 * MINUTE },
	},
};
