import type { Request, Response } from "express";

import { authConfig } from "../../../config/auth.js";
import type { AuthContext, RequestMeta } from "../auth.types.js";

const cookieOptions = {
	httpOnly: true,
	secure: authConfig.cookie.secure,
	sameSite: authConfig.cookie.sameSite,
	path: authConfig.cookie.path,
	domain: authConfig.cookie.domain,
};

export function requestMeta(request: Request): RequestMeta {
	return { ip: request.ip, userAgent: request.get("user-agent") };
}

export function setRefreshCookie(response: Response, token: string, expiresAt: Date): void {
	response.cookie(authConfig.cookie.name, token, { ...cookieOptions, expires: expiresAt });
}

export function clearRefreshCookie(response: Response): void {
	response.clearCookie(authConfig.cookie.name, cookieOptions);
}

export function readRefreshCookie(request: Request): string | undefined {
	const header = request.get("cookie");
	if (!header) return undefined;

	for (const part of header.split(";")) {
		const separator = part.indexOf("=");
		if (separator === -1 || part.slice(0, separator).trim() !== authConfig.cookie.name) continue;
		const value = part.slice(separator + 1).trim();
		return value.length > 0 ? value : undefined;
	}
	return undefined;
}

export function validatedBody<T>(response: Response): T {
	return response.locals.validatedBody as T;
}

export function validatedParams<T>(response: Response): T {
	return response.locals.validatedParams as T;
}

export function authContext(response: Response): AuthContext {
	return response.locals.auth as AuthContext;
}
