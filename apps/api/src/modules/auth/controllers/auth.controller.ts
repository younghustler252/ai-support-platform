import type { Request, Response } from "express";

import { AuthenticationError } from "../../../foundation/errors/app-error.js";
import {
	authContext,
	clearRefreshCookie,
	readRefreshCookie,
	requestMeta,
	setRefreshCookie,
	validatedBody,
	validatedParams,
} from "../http/auth-http.js";
import type { ChangePasswordUseCase } from "../usecases/change-password.usecase.js";
import type { ListSessionsUseCase } from "../usecases/list-sessions.usecase.js";
import type { LoginUseCase } from "../usecases/login.usecase.js";
import type { LogoutAllUseCase } from "../usecases/logout-all.usecase.js";
import type { LogoutUseCase } from "../usecases/logout.usecase.js";
import type { RefreshTokenUseCase } from "../usecases/refresh-token.usecase.js";
import type { RegisterUseCase } from "../usecases/register.usecase.js";
import type { ResetPasswordUseCase } from "../usecases/reset-password.usecase.js";
import type { RevokeSessionUseCase } from "../usecases/revoke-session.usecase.js";
import type { SendAuthTokenUseCase } from "../usecases/send-auth-token.usecase.js";
import type { VerifyEmailUseCase } from "../usecases/verify-email.usecase.js";
import type {
	ChangePasswordInput,
	EmailInput,
	LoginInput,
	RegisterInput,
	ResetInput,
	SessionParams,
	TokenInput,
} from "../validators/auth.validator.js";

interface Dependencies {
	registerUseCase: RegisterUseCase;
	verifyEmailUseCase: VerifyEmailUseCase;
	sendAuthTokenUseCase: SendAuthTokenUseCase;
	resetPasswordUseCase: ResetPasswordUseCase;
	loginUseCase: LoginUseCase;
	refreshTokenUseCase: RefreshTokenUseCase;
	logoutUseCase: LogoutUseCase;
	logoutAllUseCase: LogoutAllUseCase;
	changePasswordUseCase: ChangePasswordUseCase;
	listSessionsUseCase: ListSessionsUseCase;
	revokeSessionUseCase: RevokeSessionUseCase;
}

export class AuthController {
	constructor(private readonly deps: Dependencies) {}

	register = async (request: Request, response: Response): Promise<void> => {
		const input = validatedBody<RegisterInput>(response);
		response.status(201).json({ data: await this.deps.registerUseCase.execute(input, requestMeta(request)) });
	};

	verifyEmail = async (request: Request, response: Response): Promise<void> => {
		const { token } = validatedBody<TokenInput>(response);
		response.json({ data: await this.deps.verifyEmailUseCase.execute(token, requestMeta(request)) });
	};

	resendVerification = async (request: Request, response: Response): Promise<void> => {
		const { email } = validatedBody<EmailInput>(response);
		response.status(202).json({ data: await this.deps.sendAuthTokenUseCase.execute(email, "verify", requestMeta(request)) });
	};

	forgotPassword = async (request: Request, response: Response): Promise<void> => {
		const { email } = validatedBody<EmailInput>(response);
		response.status(202).json({ data: await this.deps.sendAuthTokenUseCase.execute(email, "reset", requestMeta(request)) });
	};

	resetPassword = async (request: Request, response: Response): Promise<void> => {
		const { token, password } = validatedBody<ResetInput>(response);
		response.json({ data: await this.deps.resetPasswordUseCase.execute(token, password, requestMeta(request)) });
	};

	login = async (request: Request, response: Response): Promise<void> => {
		const input = validatedBody<LoginInput>(response);
		const result = await this.deps.loginUseCase.execute(input, requestMeta(request));
		setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
		response.json({ data: { user: result.user, accessToken: result.accessToken, expiresIn: result.expiresIn } });
	};

	refresh = async (request: Request, response: Response): Promise<void> => {
		const token = readRefreshCookie(request);
		if (!token) throw new AuthenticationError();

		try {
			const result = await this.deps.refreshTokenUseCase.execute(token, requestMeta(request));
			setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
			response.json({ data: { accessToken: result.accessToken, expiresIn: result.expiresIn } });
		} catch (error) {
			if (error instanceof AuthenticationError) clearRefreshCookie(response);
			throw error;
		}
	};

	logout = async (request: Request, response: Response): Promise<void> => {
		const token = readRefreshCookie(request);
		if (token) await this.deps.logoutUseCase.execute(token, requestMeta(request));
		clearRefreshCookie(response);
		response.json({ data: { loggedOut: true } });
	};

	logoutAll = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const result = await this.deps.logoutAllUseCase.execute(user.id, requestMeta(request));
		clearRefreshCookie(response);
		response.json({ data: result });
	};

	changePassword = async (request: Request, response: Response): Promise<void> => {
		const { user, sessionId } = authContext(response);
		const { currentPassword, newPassword } = validatedBody<ChangePasswordInput>(response);
		const result = await this.deps.changePasswordUseCase.execute(
			{ userId: user.id, sessionId, currentPassword, newPassword },
			requestMeta(request),
		);
		response.json({ data: result });
	};

	me = async (_request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		response.json({ data: { user } });
	};

	listSessions = async (_request: Request, response: Response): Promise<void> => {
		const { user, sessionId } = authContext(response);
		response.json({ data: { sessions: await this.deps.listSessionsUseCase.execute(user.id, sessionId) } });
	};

	revokeSession = async (request: Request, response: Response): Promise<void> => {
		const { user, sessionId } = authContext(response);
		const params = validatedParams<SessionParams>(response);
		const result = await this.deps.revokeSessionUseCase.execute(user.id, params.sessionId, sessionId, requestMeta(request));
		if (result.current) clearRefreshCookie(response);
		response.json({ data: { revoked: result.revoked } });
	};
}
