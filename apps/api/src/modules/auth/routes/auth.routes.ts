import { Router } from "express";
import type { AwilixContainer } from "awilix";
import { z } from "zod";
import { AuthenticationError, ForbiddenError } from "../../../foundation/errors/app-error.js";
import { parseInput } from "../../../foundation/validation/validate.js";
import { env } from "../../../config/env.js";
import type { AuthService } from "../services/auth.service.js";
import { registerSchema } from "../validators/auth.validator.js";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z.string().min(12).max(128);
const token = z.string().min(20).max(512);
const loginSchema = z.strictObject({ email, password: z.string().min(1) });
const emailSchema = z.strictObject({ email });
const tokenSchema = z.strictObject({ token });
const resetSchema = z.strictObject({ token, password });
const cookieName = "supportai_refresh";
const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/v1/auth", maxAge: 7 * 86400000 };
function cookieValue(header?: string) {
	return header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
}
function checkOrigin(origin?: string) {
	if (!origin) return;
	const allowed = env.CORS_ORIGINS.split(",").map((value) => value.trim());
	if (!allowed.includes(origin)) throw new ForbiddenError("Untrusted request origin");
}

export function authRouter(_container: AwilixContainer): Router {
	const router = Router();
	const handler = (action: (service: AuthService, request: import("express").Request, response: import("express").Response) => Promise<void>) =>
		async (request: import("express").Request, response: import("express").Response, next: import("express").NextFunction) => {
			try {
				const scope = response.locals.scope as AwilixContainer;
				await action(scope.resolve<AuthService>("authService"), request, response);
			} catch (error) { next(error); }
		};
	router.post("/register", handler(async (service, request, response) => {
		const result = await service.register(parseInput(registerSchema, request.body));
		response.status(201).json({ data: result });
	}));
	router.post("/verify-email", handler(async (service, request, response) => {
		const { token } = parseInput(tokenSchema, request.body);
		response.json({ data: await service.verifyEmail(token) });
	}));
	router.post("/resend-verification", handler(async (service, request, response) => {
		const { email } = parseInput(emailSchema, request.body);
		response.status(202).json({ data: await service.sendToken(email, "verify") });
	}));
	router.post("/forgot-password", handler(async (service, request, response) => {
		const { email } = parseInput(emailSchema, request.body);
		response.status(202).json({ data: await service.sendToken(email, "reset") });
	}));
	router.post("/reset-password", handler(async (service, request, response) => {
		const { token, password } = parseInput(resetSchema, request.body);
		response.json({ data: await service.resetPassword(token, password) });
	}));
	router.post("/login", handler(async (service, request, response) => {
		const input = parseInput(loginSchema, request.body);
		const result = await service.login(input.email, input.password, request.get("user-agent"));
		response.cookie(cookieName, result.refreshToken, cookieOptions);
		response.json({ data: { user: result.user, accessToken: result.accessToken, expiresIn: result.expiresIn } });
	}));
	router.post("/refresh", handler(async (service, request, response) => {
		checkOrigin(request.get("origin"));
		const refreshToken = cookieValue(request.get("cookie"));
		if (!refreshToken) throw new AuthenticationError();
		const result = await service.refresh(refreshToken, request.get("user-agent"));
		response.cookie(cookieName, result.refreshToken, cookieOptions);
		response.json({ data: { accessToken: result.accessToken, expiresIn: result.expiresIn } });
	}));
	router.post("/logout", handler(async (service, request, response) => {
		checkOrigin(request.get("origin"));
		const refreshToken = cookieValue(request.get("cookie"));
		if (refreshToken) await service.logout(refreshToken);
		response.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined });
		response.json({ data: { loggedOut: true } });
	}));
	router.post("/logout-all", handler(async (service, request, response) => {
		const { user } = await service.authenticate(request.get("authorization"));
		checkOrigin(request.get("origin"));
		response.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined });
		response.json({ data: await service.logoutAll(user.id) });
	}));
	router.get("/me", handler(async (service, request, response) => {
		const { user } = await service.authenticate(request.get("authorization"));
		response.json({ data: { user } });
	}));
	return router;
}
