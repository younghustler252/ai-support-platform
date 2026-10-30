import { ValidationError } from "../../../foundation/errors/app-error.js";
import type { IAuthRepository } from "../repositories/auth.repository.interface.js";
import type { PasswordService } from "../services/password.service.js";
import type { TokenService } from "../services/token.service.js";

export class ResetPasswordUseCase {
	constructor(private readonly deps: {
		authRepository: IAuthRepository;
		passwordService: PasswordService;
		tokenService: TokenService;
	}) {}

	async execute(token: string, password: string) {
		const record = await this.deps.authRepository.findToken(this.deps.tokenService.hash(token));
		if (!record || record.type !== "PASSWORD_RESET" || record.consumedAt || record.expiresAt <= new Date()) {
			throw new ValidationError("Invalid or expired reset token");
		}
		const passwordHash = await this.deps.passwordService.hash(password);
		if (!(await this.deps.authRepository.resetPassword(record.id, record.userId, passwordHash))) {
			throw new ValidationError("Reset token already used");
		}
		return { reset: true };
	}
}
