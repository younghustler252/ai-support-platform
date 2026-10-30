import type { RegisterUseCase } from "../usecases/register.usecase.js";
import type { VerifyEmailUseCase } from "../usecases/verify-email.usecase.js";
import type { SendAuthTokenUseCase } from "../usecases/send-auth-token.usecase.js";
import type { ResetPasswordUseCase } from "../usecases/reset-password.usecase.js";
import type { LoginUseCase } from "../usecases/login.usecase.js";
import type { RefreshTokenUseCase } from "../usecases/refresh-token.usecase.js";
import type { LogoutUseCase } from "../usecases/logout.usecase.js";
import type { LogoutAllUseCase } from "../usecases/logout-all.usecase.js";
import type { GetCurrentUserUseCase } from "../usecases/get-current-user.usecase.js";
import type { RegisterInput } from "../validators/auth.validator.js";

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

export class AuthController {
	constructor(private readonly deps: Dependencies) {}

	register(input: RegisterInput) { return this.deps.registerUseCase.execute(input); }
	verifyEmail(token: string) { return this.deps.verifyEmailUseCase.execute(token); }
	sendToken(email: string, purpose: "verify" | "reset") { return this.deps.sendAuthTokenUseCase.execute(email, purpose); }
	resetPassword(token: string, password: string) { return this.deps.resetPasswordUseCase.execute(token, password); }
	login(email: string, password: string, userAgent?: string) { return this.deps.loginUseCase.execute(email, password, userAgent); }
	refresh(token: string, userAgent?: string) { return this.deps.refreshTokenUseCase.execute(token, userAgent); }
	logout(token: string) { return this.deps.logoutUseCase.execute(token); }
	logoutAll(userId: string) { return this.deps.logoutAllUseCase.execute(userId); }
	me(authorization?: string) { return this.deps.getCurrentUserUseCase.execute(authorization); }
}
