import { ConflictError } from "../../../foundation/errors/app-error.js";
import type { IAuthRepository } from "../repositories/auth.repository.interface.js";
import type { PasswordService } from "../services/password.service.js";
import type { TokenService } from "../services/token.service.js";
import type { AuthEmailPort } from "../services/auth-email.port.js";
import type { RegisterInput } from "../validators/auth.validator.js";

interface Dependencies {
	authRepository: IAuthRepository;
	passwordService: PasswordService;
	tokenService: TokenService;
	authEmailService: AuthEmailPort;
}

export class RegisterUseCase {
	constructor(private readonly deps: Dependencies) {}

	async execute(input: RegisterInput) {
		if (await this.deps.authRepository.findByEmail(input.email)) {
			throw new ConflictError("An account with this email already exists");
		}
		const passwordHash = await this.deps.passwordService.hash(input.password);
		const token = this.deps.tokenService.generate();
		let user;
		try {
			user = await this.deps.authRepository.register({
				email: input.email, displayName: input.displayName, passwordHash,
				tokenHash: this.deps.tokenService.hash(token),
			});
		} catch (error) {
			if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
				throw new ConflictError("An account with this email already exists");
			}
			throw error;
		}
		await this.deps.authEmailService.send(input.email, "verify", token);
		return { user, verificationRequired: true };
	}
}
