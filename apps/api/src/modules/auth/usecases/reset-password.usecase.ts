import { ValidationError } from "../../../foundation/errors/app-error.js";
import type { AuthRepository } from "../repositories/auth.repository.js";
import type { PasswordService } from "../services/password.service.js";
import type { TokenService } from "../services/token.service.js";

export class ResetPasswordUseCase {
	constructor(private readonly deps: {
		authRepository: AuthRepository;
		passwordService: PasswordService;
		tokenService: TokenService;
	}) {}

	async execute(token: string, password: string) {
		const record = await this.deps.authRepository.findToken(this.deps.tokenService.hash(token));
		if (!record || record.type !== "PASSWORD_RESET" || record.consumedAt || record.expiresAt <= new Date()) {
			throw new ValidationError("Invalid or expired reset token");
		}
		const passwordHash = await this.deps.passwordService.hash(password);
		await this.deps.authRepository.db.$transaction(async (tx) => {
			const changed = await tx.authToken.updateMany({
				where: { id: record.id, consumedAt: null, expiresAt: { gt: new Date() } },
				data: { consumedAt: new Date() },
			});
			if (!changed.count) throw new ValidationError("Reset token already used");
			await tx.user.update({ where: { id: record.userId }, data: {
				passwordHash, authVersion: { increment: 1 },
			} });
			await tx.authSession.updateMany({
				where: { userId: record.userId, revokedAt: null },
				data: { revokedAt: new Date() },
			});
		});
		return { reset: true };
	}
}
