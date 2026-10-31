import { asClass, type AwilixContainer } from "awilix";
import { AuthEmailAdapter } from "../../infrastructure/email/auth-email.adapter.js";
import { AuthController } from "./controllers/auth.controller.js";
import { AuthRepositoryImpl } from "./repositories/auth.repository.impl.js";
import { SessionRepositoryImpl } from "./repositories/session.repository.impl.js";
import { AuthMaintenanceService } from "./services/auth-maintenance.service.js";
import { PasswordService } from "./services/password.service.js";
import { SessionService } from "./services/session.service.js";
import { TokenService } from "./services/token.service.js";
import { ChangePasswordUseCase } from "./usecases/change-password.usecase.js";
import { GetCurrentUserUseCase } from "./usecases/get-current-user.usecase.js";
import { ListSessionsUseCase } from "./usecases/list-sessions.usecase.js";
import { LoginUseCase } from "./usecases/login.usecase.js";
import { LogoutAllUseCase } from "./usecases/logout-all.usecase.js";
import { LogoutUseCase } from "./usecases/logout.usecase.js";
import { RefreshTokenUseCase } from "./usecases/refresh-token.usecase.js";
import { RegisterUseCase } from "./usecases/register.usecase.js";
import { ResetPasswordUseCase } from "./usecases/reset-password.usecase.js";
import { RevokeSessionUseCase } from "./usecases/revoke-session.usecase.js";
import { SendAuthTokenUseCase } from "./usecases/send-auth-token.usecase.js";
import { VerifyEmailUseCase } from "./usecases/verify-email.usecase.js";

export function registerAuth(container: AwilixContainer): void {
	container.register({
		authRepository: asClass(AuthRepositoryImpl).scoped(),
		sessionRepository: asClass(SessionRepositoryImpl).scoped(),
		passwordService: asClass(PasswordService).singleton(),
		tokenService: asClass(TokenService).singleton(),
		authEmailService: asClass(AuthEmailAdapter).singleton(),
		sessionService: asClass(SessionService).scoped(),
		authMaintenanceService: asClass(AuthMaintenanceService).scoped(),
		registerUseCase: asClass(RegisterUseCase).scoped(),
		verifyEmailUseCase: asClass(VerifyEmailUseCase).scoped(),
		sendAuthTokenUseCase: asClass(SendAuthTokenUseCase).scoped(),
		resetPasswordUseCase: asClass(ResetPasswordUseCase).scoped(),
		loginUseCase: asClass(LoginUseCase).scoped(),
		refreshTokenUseCase: asClass(RefreshTokenUseCase).scoped(),
		logoutUseCase: asClass(LogoutUseCase).scoped(),
		logoutAllUseCase: asClass(LogoutAllUseCase).scoped(),
		changePasswordUseCase: asClass(ChangePasswordUseCase).scoped(),
		listSessionsUseCase: asClass(ListSessionsUseCase).scoped(),
		revokeSessionUseCase: asClass(RevokeSessionUseCase).scoped(),
		getCurrentUserUseCase: asClass(GetCurrentUserUseCase).scoped(),
		authController: asClass(AuthController).scoped(),
	});
}
