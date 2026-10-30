import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { AwilixContainer } from "awilix";
import { validateBody } from "../../../foundation/validation/validate.js";
import type { AuthController } from "../controllers/auth.controller.js";
import { registerSchema, loginSchema, emailSchema, tokenSchema, resetSchema } from "../validators/auth.validator.js";
import { authRateLimit } from "../middleware/auth-rate-limit.js";
import { requireAuth } from "../middleware/require-auth.js";

export function authRouter(_container: AwilixContainer): Router {
	const router = Router();
	router.use(authRateLimit(30, 15 * 60 * 1000));
	const delegate = (method: keyof AuthController) => async (req: Request, res: Response, next: NextFunction) => {
		try {
			const scope = res.locals.scope as AwilixContainer;
			const controller = scope.resolve<AuthController>("authController");
			await controller[method](req, res);
		} catch (error) { next(error); }
	};
	router.post("/register", validateBody(registerSchema), delegate("register"));
	router.post("/verify-email", validateBody(tokenSchema), delegate("verifyEmail"));
	router.post("/resend-verification", validateBody(emailSchema), delegate("resendVerification"));
	router.post("/forgot-password", validateBody(emailSchema), delegate("forgotPassword"));
	router.post("/reset-password", validateBody(resetSchema), delegate("resetPassword"));
	router.post("/login", validateBody(loginSchema), delegate("login"));
	router.post("/refresh", delegate("refresh"));
	router.post("/logout", delegate("logout"));
	router.post("/logout-all", requireAuth, delegate("logoutAll"));
	router.get("/me", requireAuth, delegate("me"));
	return router;
}
