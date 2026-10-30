import type { AuthRepository } from "../repositories/auth.repository.js";
import type { AuthEmailPort } from "../services/auth-email.port.js";
import type { TokenService } from "../services/token.service.js";

export class SendAuthTokenUseCase {
	constructor(private readonly deps: {
		authRepository: AuthRepository;
		authEmailService: AuthEmailPort;
		tokenService: TokenService;
	}) {}

	async execute(email: string, purpose: "verify" | "reset") {
		const user = await this.deps.authRepository.findByEmail(email);
		if (!user || (purpose === "verify" && user.emailVerifiedAt) ||
			(purpose === "reset" && !user.passwordHash)) return { accepted: true };
		const type = purpose === "verify" ? "EMAIL_VERIFICATION" : "PASSWORD_RESET";
		const token = this.deps.tokenService.generate();
		await this.deps.authRepository.db.$transaction(async (tx) => {
			await tx.authToken.updateMany({
				where: { userId: user.id, type, consumedAt: null },
				data: { consumedAt: new Date() },
			});
			await tx.authToken.create({ data: {
				userId: user.id, type,
				tokenHash: this.deps.tokenService.hash(token),
				expiresAt: new Date(Date.now() + (purpose === "verify" ? 86400000 : 3600000)),
			} });
		});
		await this.deps.authEmailService.send(email, purpose, token);
		return { accepted: true };
	}
}
