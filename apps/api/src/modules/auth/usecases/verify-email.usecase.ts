import { ValidationError } from "../../../foundation/errors/app-error.js";
import type { IAuthRepository } from "../repositories/auth.repository.interface.js";
import type { TokenService } from "../services/token.service.js";

export class VerifyEmailUseCase {
	constructor(private readonly deps: { authRepository: IAuthRepository; tokenService: TokenService }) {}

	async execute(token: string) {
		const record = await this.deps.authRepository.findToken(this.deps.tokenService.hash(token));
		if (!record || record.type !== "EMAIL_VERIFICATION" || record.consumedAt || record.expiresAt <= new Date()) {
			throw new ValidationError("Invalid or expired verification token");
		}
		if (!(await this.deps.authRepository.consumeVerification(record.id, record.userId))) {
			throw new ValidationError("Verification token already used");
		}
		return { verified: true };
	}
}
