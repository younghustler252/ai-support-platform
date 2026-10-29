import { Router } from "express";
import type { AwilixContainer } from "awilix";
import { validateBody } from "../../../foundation/validation/validate.js";
import type { AuthController } from "../controllers/auth.controller.js";
import { registerSchema } from "../validators/auth.validator.js";

export function authRouter(_container: AwilixContainer): Router {
	const router = Router();

	router.post("/register", validateBody(registerSchema), async (request, response, next) => {
		try {
			const scope = response.locals.scope as AwilixContainer;
			const controller = scope.resolve<AuthController>("authController");
			await controller.register(request, response);
		} catch (error) {
			next(error);
		}
	});

	return router;
}
