import type { IAuthRepository } from "../repositories/auth.repository.interface.js";
import type { AuthEmailPort } from "../services/auth-email.port.js";
import type { TokenService } from "../services/token.service.js";

export class SendAuthTokenUseCase {
	constructor(private readonly deps: {
		authRepository: IAuthRepository;
		authEmailService: AuthEmailPort;
		tokenService: TokenService;
	}) {}

	async execute(email: string, purpose: "verify" | "reset") {
		const user = await this.deps.authRepository.findByEmail(email);
		if (!user || (purpose === "verify" && user.emailVerifiedAt) ||
			(purpose === "reset" && !user.passwordHash)) return { accepted: true };
		const type = purpose === "verify" ? "EMAIL_VERIFICATION" : "PASSWORD_RESET";
		const token = this.deps.tokenService.generate();
		await this.deps.authRepository.replaceToken(
			user.id, type, this.deps.tokenService.hash(token),
			new Date(Date.now() + (purpose === "verify" ? 86400000 : 3600000)),
		);
		await this.deps.authEmailService.send(email, purpose, token);
		return { accepted: true };
	}
}
