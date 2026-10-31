import type { RequestHandler } from "express";
import type { AwilixContainer } from "awilix";

import type { RequestContext } from "../../../foundation/context/request-context.js";
import type { GetCurrentUserUseCase } from "../usecases/get-current-user.usecase.js";

export const requireAuth: RequestHandler = async (request, response, next) => {
	const scope = response.locals.scope as AwilixContainer;
	const identity = await scope.resolve<GetCurrentUserUseCase>("getCurrentUserUseCase").execute(request.get("authorization"));

	response.locals.auth = identity;
	const context = response.locals.requestContext as RequestContext | undefined;
	if (context) context.userId = identity.user.id;
	next();
};
