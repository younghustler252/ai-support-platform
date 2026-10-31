import { Router } from "express";
import type { Request, RequestHandler, Response } from "express";
import type { AwilixContainer } from "awilix";

import { authConfig } from "../../../config/auth.js";
import { corsOrigins } from "../../../config/env.js";
import { noStore } from "../../../foundation/middleware/no-store.js";
import { clientIp, rateLimit, type RateLimitRule } from "../../../foundation/middleware/rate-limit.js";
import { requireTrustedOrigin } from "../../../foundation/middleware/trusted-origin.js";
import { validateBody, validateParams } from "../../../foundation/validation/validate.js";
import type { AuthContext } from "../auth.types.js";
import type { AuthController } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/require-auth.js";
import {
	changePasswordSchema,
	emailSchema,
	loginSchema,
	registerSchema,
	resetSchema,
	sessionParamsSchema,
	tokenSchema,
} from "../validators/auth.validator.js";

interface Limit {
	limit: number;
	windowMs: number;
}

const limits = authConfig.rateLimits;

function ipRule(name: string, limit: Limit): RateLimitRule {
	return { name, ...limit, key: (request) => clientIp(request) };
}

function bodyEmail(response: Response): string | null {
	const body = response.locals.validatedBody as { email?: unknown } | undefined;
	return typeof body?.email === "string" ? body.email : null;
}

const registerLimit = rateLimit(ipRule("register:ip", limits.registerIp));
const tokenSubmitLimit = rateLimit(ipRule("token-submit:ip", limits.tokenSubmitIp));
const refreshLimit = rateLimit(ipRule("refresh:ip", limits.refreshIp));
const loginLimit = rateLimit(
	ipRule("login:ip", limits.loginIp),
	{
		name: "login:account",
		...limits.loginAccount,
		key: (request: Request, response: Response) => {
			const email = bodyEmail(response);
			return email ? `${clientIp(request)}|${email}` : null;
		},
	},
);
const tokenRequestLimit = rateLimit(
	ipRule("token-request:ip", limits.tokenRequestIp),
	{ name: "token-request:email", ...limits.tokenRequestEmail, key: (_request, response) => bodyEmail(response) },
);
const changePasswordLimit = rateLimit({
	name: "change-password:user",
	...limits.changePassword,
	key: (_request, response) => (response.locals.auth as AuthContext | undefined)?.user.id ?? null,
});

function delegate(method: keyof AuthController): RequestHandler {
	return async (request, response) => {
		const controller = (response.locals.scope as AwilixContainer).resolve<AuthController>("authController");
		await controller[method](request, response);
	};
}

export function authRouter(): Router {
	const router = Router();
	const trustedOrigin = requireTrustedOrigin(corsOrigins);

	router.use(noStore);

	router.post("/register", registerLimit, validateBody(registerSchema), delegate("register"));
	router.post("/verify-email", tokenSubmitLimit, validateBody(tokenSchema), delegate("verifyEmail"));
	router.post("/resend-verification", validateBody(emailSchema), tokenRequestLimit, delegate("resendVerification"));
	router.post("/forgot-password", validateBody(emailSchema), tokenRequestLimit, delegate("forgotPassword"));
	router.post("/reset-password", tokenSubmitLimit, validateBody(resetSchema), delegate("resetPassword"));

	router.post("/login", trustedOrigin, validateBody(loginSchema), loginLimit, delegate("login"));
	router.post("/refresh", trustedOrigin, refreshLimit, delegate("refresh"));
	router.post("/logout", trustedOrigin, delegate("logout"));
	router.post("/logout-all", trustedOrigin, requireAuth, delegate("logoutAll"));

	router.get("/me", requireAuth, delegate("me"));
	router.post("/change-password", requireAuth, validateBody(changePasswordSchema), changePasswordLimit, delegate("changePassword"));
	router.get("/sessions", requireAuth, delegate("listSessions"));
	router.delete("/sessions/:sessionId", requireAuth, validateParams(sessionParamsSchema), delegate("revokeSession"));

	return router;
}
