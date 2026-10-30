import type { RequestHandler } from "express";
import type { AwilixContainer } from "awilix";
import type { GetCurrentUserUseCase } from "../usecases/get-current-user.usecase.js";

/**
 * Resolve the authenticated user from the access token and its active session.
 * Apply before controllers requiring a signed-in, verified account.
 */
export const requireAuth: RequestHandler = async (request, response, next) => {
	try {
		const scope = response.locals.scope as AwilixContainer;
		const getCurrentUser = scope.resolve<GetCurrentUserUseCase>("getCurrentUserUseCase");
		const identity = await getCurrentUser.execute(request.get("authorization"));
		response.locals.auth = identity;
		next();
	} catch (error) {
		next(error);
	}
};
