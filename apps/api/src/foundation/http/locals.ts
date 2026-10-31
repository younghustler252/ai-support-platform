import type { Request, RequestHandler, Response } from "express";
import type { AwilixContainer } from "awilix";

export function validatedBody<T>(response: Response): T {
	return response.locals.validatedBody as T;
}

export function validatedParams<T>(response: Response): T {
	return response.locals.validatedParams as T;
}

export function validatedQuery<T>(response: Response): T {
	return response.locals.validatedQuery as T;
}

export function delegate<TController>(
	controllerName: string,
	method: { [K in keyof TController]: TController[K] extends (request: Request, response: Response) => Promise<void> ? K : never }[keyof TController],
): RequestHandler {
	return async (request, response) => {
		const controller = (response.locals.scope as AwilixContainer).resolve<TController>(controllerName);
		const handler = controller[method] as unknown as (request: Request, response: Response) => Promise<void>;
		await handler(request, response);
	};
}
