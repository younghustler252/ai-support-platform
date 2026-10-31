import { authConfig } from "../../../config/auth.js";
import { ConflictError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import { auditContext, type PublicUser, type RequestMeta } from "../auth.types.js";
import { isUniqueViolation, logEmailFailure } from "../auth.utils.js";
import type { IAuthRepository } from "../repositories/auth.repository.interface.js";
import type { AuthEmailPort } from "../services/auth-email.port.js";
import type { PasswordService } from "../services/password.service.js";
import type { TokenService } from "../services/token.service.js";
import type { RegisterInput } from "../validators/auth.validator.js";

interface Dependencies {
	authRepository: IAuthRepository;
	passwordService: PasswordService;
	tokenService: TokenService;
	authEmailService: AuthEmailPort;
	auditService: AuditRecorder;
}

const EXISTS_MESSAGE = "An account with this email already exists";

export class RegisterUseCase {
	constructor(private readonly deps: Dependencies) {}

	async execute(input: RegisterInput, meta: RequestMeta = {}): Promise<{ user: PublicUser; verificationRequired: true }> {
		const { authRepository, passwordService, tokenService } = this.deps;

		if (await authRepository.findByEmail(input.email)) throw new ConflictError(EXISTS_MESSAGE);

		const passwordHash = await passwordService.hash(input.password);
		const token = tokenService.generate();
		let user: PublicUser;
		try {
			user = await authRepository.register({
				email: input.email,
				displayName: input.displayName,
				passwordHash,
				tokenHash: tokenService.hash(token),
				tokenExpiresAt: new Date(Date.now() + authConfig.verifyTtlMs),
			});
		} catch (error) {
			if (isUniqueViolation(error)) throw new ConflictError(EXISTS_MESSAGE);
			throw error;
		}

		await this.deps.auditService.record({
			actorUserId: user.id,
			action: "auth.register",
			resourceType: "User",
			resourceId: user.id,
			metadata: auditContext(meta),
		});
		await this.deps.authEmailService.sendVerification(input.email, token).catch(logEmailFailure("register"));

		return { user, verificationRequired: true };
	}
}
