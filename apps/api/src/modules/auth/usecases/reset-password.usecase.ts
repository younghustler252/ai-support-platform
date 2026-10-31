import { ValidationError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import { auditContext, type RequestMeta } from "../auth.types.js";
import { logEmailFailure } from "../auth.utils.js";
import type { IAuthRepository } from "../repositories/auth.repository.interface.js";
import type { AuthEmailPort } from "../services/auth-email.port.js";
import type { PasswordService } from "../services/password.service.js";
import type { TokenService } from "../services/token.service.js";

export class ResetPasswordUseCase {
	constructor(private readonly deps: {
		authRepository: IAuthRepository;
		passwordService: PasswordService;
		tokenService: TokenService;
		authEmailService: AuthEmailPort;
		auditService: AuditRecorder;
	}) {}

	async execute(token: string, password: string, meta: RequestMeta = {}): Promise<{ reset: true }> {
		const { authRepository, passwordService, tokenService } = this.deps;
		const record = await authRepository.findToken(tokenService.hash(token));
		if (!record || record.type !== "PASSWORD_RESET" || record.consumedAt || record.expiresAt <= new Date()) {
			throw new ValidationError("Invalid or expired reset token");
		}

		const passwordHash = await passwordService.hash(password);
		if (!(await authRepository.resetPassword(record.id, record.userId, passwordHash))) {
			throw new ValidationError("Reset token already used");
		}

		await this.deps.auditService.record({
			actorUserId: record.userId,
			action: "auth.password.reset",
			resourceType: "User",
			resourceId: record.userId,
			metadata: auditContext(meta),
		});
		const user = await authRepository.findById(record.userId);
		if (user) {
			await this.deps.authEmailService.sendPasswordChanged(user.email).catch(logEmailFailure("password-reset-notice"));
		}
		return { reset: true };
	}
}
