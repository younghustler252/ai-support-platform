import { authConfig } from "../../../config/auth.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import { auditContext, type RequestMeta } from "../auth.types.js";
import { logEmailFailure } from "../auth.utils.js";
import type { AuthTokenType, IAuthRepository } from "../repositories/auth.repository.interface.js";
import type { AuthEmailPort } from "../services/auth-email.port.js";
import type { TokenService } from "../services/token.service.js";

export class SendAuthTokenUseCase {
	constructor(private readonly deps: {
		authRepository: IAuthRepository;
		authEmailService: AuthEmailPort;
		tokenService: TokenService;
		auditService: AuditRecorder;
	}) {}

	async execute(email: string, purpose: "verify" | "reset", meta: RequestMeta = {}): Promise<{ accepted: true }> {
		const { authRepository, tokenService } = this.deps;
		const user = await authRepository.findByEmail(email);
		if (
			!user ||
			user.disabledAt ||
			(purpose === "verify" && user.emailVerifiedAt) ||
			(purpose === "reset" && !user.passwordHash)
		) {
			return { accepted: true };
		}

		const type: AuthTokenType = purpose === "verify" ? "EMAIL_VERIFICATION" : "PASSWORD_RESET";
		const latest = await authRepository.findLatestToken(user.id, type);
		if (latest && Date.now() - latest.createdAt.getTime() < authConfig.resendCooldownMs) {
			return { accepted: true };
		}

		const token = tokenService.generate();
		const ttl = purpose === "verify" ? authConfig.verifyTtlMs : authConfig.resetTtlMs;
		await authRepository.replaceToken(user.id, type, tokenService.hash(token), new Date(Date.now() + ttl));

		const send = purpose === "verify"
			? this.deps.authEmailService.sendVerification(email, token)
			: this.deps.authEmailService.sendPasswordReset(email, token);
		await send.catch(logEmailFailure(purpose));

		if (purpose === "reset") {
			await this.deps.auditService.record({
				actorUserId: user.id,
				action: "auth.password.reset_requested",
				resourceType: "User",
				resourceId: user.id,
				metadata: auditContext(meta),
			});
		}
		return { accepted: true };
	}
}
