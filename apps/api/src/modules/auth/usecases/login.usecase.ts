import { AuthenticationError } from "../../../foundation/errors/app-error.js";
import type { AuthRepository } from "../repositories/auth.repository.js";
import type { PasswordService } from "../services/password.service.js";
import type { SessionService } from "../services/session.service.js";

export class LoginUseCase {
	constructor(private readonly deps: {
		authRepository: AuthRepository;
		passwordService: PasswordService;
		sessionService: SessionService;
	}) {}

	async execute(email: string, password: string, userAgent?: string) {
		const user = await this.deps.authRepository.findByEmail(email);
		if (!user?.passwordHash || !(await this.deps.passwordService.verify(user.passwordHash, password))) {
			throw new AuthenticationError("Invalid credentials");
		}
		if (!user.emailVerifiedAt) throw new AuthenticationError("Email verification required");
		return {
			user: { id: user.id, email: user.email, displayName: user.displayName, emailVerifiedAt: user.emailVerifiedAt },
			...await this.deps.sessionService.create(user.id, userAgent),
		};
	}
}
