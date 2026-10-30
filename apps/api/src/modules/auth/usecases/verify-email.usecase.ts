import { ValidationError } from "../../../foundation/errors/app-error.js";
import type { AuthRepository } from "../repositories/auth.repository.js";
import type { TokenService } from "../services/token.service.js";

export class VerifyEmailUseCase {
	constructor(private readonly deps: { authRepository: AuthRepository; tokenService: TokenService }) {}

	async execute(token: string) {
		const record = await this.deps.authRepository.findToken(this.deps.tokenService.hash(token));
		if (!record || record.type !== "EMAIL_VERIFICATION" || record.consumedAt || record.expiresAt <= new Date()) {
			throw new ValidationError("Invalid or expired verification token");
		}
		await this.deps.authRepository.db.$transaction(async (tx) => {
			const updated = await tx.authToken.updateMany({
				where: { id: record.id, consumedAt: null, expiresAt: { gt: new Date() } },
				data: { consumedAt: new Date() },
			});
			if (!updated.count) throw new ValidationError("Verification token already used");
			await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
		});
		return { verified: true };
	}
}
