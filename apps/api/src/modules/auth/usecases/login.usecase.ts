import {
	AuthenticationError,
	EmailNotVerifiedError,
	ForbiddenError,
} from "../../../foundation/errors/app-error.js";
import { logger } from "../../../foundation/logging/logger.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import { auditContext, toPublicUser, type PublicUser, type RequestMeta, type SessionTokens } from "../auth.types.js";
import type { IAuthRepository } from "../repositories/auth.repository.interface.js";
import type { PasswordService } from "../services/password.service.js";
import type { SessionService } from "../services/session.service.js";

export interface LoginResult extends SessionTokens {
	user: PublicUser;
}

export class LoginUseCase {
	constructor(private readonly deps: {
		authRepository: IAuthRepository;
		passwordService: PasswordService;
		sessionService: SessionService;
		auditService: AuditRecorder;
	}) {}

	async execute(input: { email: string; password: string }, meta: RequestMeta = {}): Promise<LoginResult> {
		const { authRepository, passwordService, sessionService, auditService } = this.deps;

		const user = await authRepository.findByEmail(input.email);
		if (!user?.passwordHash) {
			await passwordService.burn(input.password);
			throw new AuthenticationError("Invalid credentials");
		}

		if (!(await passwordService.verify(user.passwordHash, input.password))) {
			await auditService.record({
				actorUserId: user.id,
				action: "auth.login.failed",
				resourceType: "User",
				resourceId: user.id,
				metadata: { ...auditContext(meta), reason: "invalid_password" },
			});
			throw new AuthenticationError("Invalid credentials");
		}

		if (user.disabledAt) {
			await auditService.record({
				actorUserId: user.id,
				action: "auth.login.blocked",
				resourceType: "User",
				resourceId: user.id,
				metadata: { ...auditContext(meta), reason: "account_disabled" },
			});
			throw new ForbiddenError("This account has been disabled");
		}
		if (!user.emailVerifiedAt) throw new EmailNotVerifiedError();

		await this.upgradeHash(user.id, user.passwordHash, input.password);
		const session = await sessionService.create(user.id, meta);
		await authRepository.markLoggedIn(user.id);
		await auditService.record({
			actorUserId: user.id,
			action: "auth.login.success",
			resourceType: "User",
			resourceId: user.id,
			metadata: auditContext(meta),
		});

		return { user: toPublicUser(user), ...session };
	}

	private async upgradeHash(userId: string, currentHash: string, password: string): Promise<void> {
		const { authRepository, passwordService } = this.deps;
		if (!passwordService.needsRehash(currentHash)) return;
		try {
			await authRepository.updatePasswordHash(userId, await passwordService.hash(password));
		} catch (error) {
			logger.warn("auth.password_rehash_failed", { userId, error });
		}
	}
}
