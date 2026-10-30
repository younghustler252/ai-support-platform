import type { Request, Response } from "express";
import { AuthenticationError, ForbiddenError } from "../../../foundation/errors/app-error.js";
import { env } from "../../../config/env.js";
import type { RegisterUseCase } from "../usecases/register.usecase.js";
import type { VerifyEmailUseCase } from "../usecases/verify-email.usecase.js";
import type { SendAuthTokenUseCase } from "../usecases/send-auth-token.usecase.js";
import type { ResetPasswordUseCase } from "../usecases/reset-password.usecase.js";
import type { LoginUseCase } from "../usecases/login.usecase.js";
import type { RefreshTokenUseCase } from "../usecases/refresh-token.usecase.js";
import type { LogoutUseCase } from "../usecases/logout.usecase.js";
import type { LogoutAllUseCase } from "../usecases/logout-all.usecase.js";
import type { GetCurrentUserUseCase } from "../usecases/get-current-user.usecase.js";
import type { RegisterInput, LoginInput, EmailInput, TokenInput, ResetInput } from "../validators/auth.validator.js";

interface Dependencies {
	registerUseCase: RegisterUseCase;
	verifyEmailUseCase: VerifyEmailUseCase;
	sendAuthTokenUseCase: SendAuthTokenUseCase;
	resetPasswordUseCase: ResetPasswordUseCase;
	loginUseCase: LoginUseCase;
	refreshTokenUseCase: RefreshTokenUseCase;
	logoutUseCase: LogoutUseCase;
	logoutAllUseCase: LogoutAllUseCase;
	getCurrentUserUseCase: GetCurrentUserUseCase;
}

const cookieName = "supportai_refresh";
const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/v1/auth", maxAge: 7 * 86400000 };
function readCookie(header?: string) {
	return header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
}
function checkOrigin(origin?: string) {
	if (origin && !env.CORS_ORIGINS.split(",").map((item) => item.trim()).includes(origin)) {
		throw new ForbiddenError("Untrusted request origin");
	}
}

export class AuthController {
	constructor(private readonly deps: Dependencies) {}

	register = async (_req: Request, res: Response) => {
		res.status(201).json({ data: await this.deps.registerUseCase.execute(res.locals.validatedBody as RegisterInput) });
	};
	verifyEmail = async (_req: Request, res: Response) => {
		const { token } = res.locals.validatedBody as TokenInput;
		res.json({ data: await this.deps.verifyEmailUseCase.execute(token) });
	};
	resendVerification = async (_req: Request, res: Response) => {
		const { email } = res.locals.validatedBody as EmailInput;
		res.status(202).json({ data: await this.deps.sendAuthTokenUseCase.execute(email, "verify") });
	};
	forgotPassword = async (_req: Request, res: Response) => {
		const { email } = res.locals.validatedBody as EmailInput;
		res.status(202).json({ data: await this.deps.sendAuthTokenUseCase.execute(email, "reset") });
	};
	resetPassword = async (_req: Request, res: Response) => {
		const { token, password } = res.locals.validatedBody as ResetInput;
		res.json({ data: await this.deps.resetPasswordUseCase.execute(token, password) });
	};
	login = async (req: Request, res: Response) => {
		const { email, password } = res.locals.validatedBody as LoginInput;
		const result = await this.deps.loginUseCase.execute(email, password, req.get("user-agent"));
		res.cookie(cookieName, result.refreshToken, cookieOptions);
		res.json({ data: { user: result.user, accessToken: result.accessToken, expiresIn: result.expiresIn } });
	};
	refresh = async (req: Request, res: Response) => {
		checkOrigin(req.get("origin"));
		const token = readCookie(req.get("cookie"));
		if (!token) throw new AuthenticationError();
		const result = await this.deps.refreshTokenUseCase.execute(token, req.get("user-agent"));
		res.cookie(cookieName, result.refreshToken, cookieOptions);
		res.json({ data: { accessToken: result.accessToken, expiresIn: result.expiresIn } });
	};
	logout = async (req: Request, res: Response) => {
		checkOrigin(req.get("origin"));
		const token = readCookie(req.get("cookie"));
		if (token) await this.deps.logoutUseCase.execute(token);
		res.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined });
		res.json({ data: { loggedOut: true } });
	};
	logoutAll = async (req: Request, res: Response) => {
		checkOrigin(req.get("origin"));
		const { user } = res.locals.auth as Awaited<ReturnType<GetCurrentUserUseCase["execute"]>>;
		const result = await this.deps.logoutAllUseCase.execute(user.id);
		res.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined });
		res.json({ data: result });
	};
	me = async (req: Request, res: Response) => {
		const { user } = res.locals.auth as Awaited<ReturnType<GetCurrentUserUseCase["execute"]>>;
		res.json({ data: { user } });
	};
}
