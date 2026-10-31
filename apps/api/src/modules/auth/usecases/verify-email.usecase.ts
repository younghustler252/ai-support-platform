import { ValidationError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import { auditContext, type RequestMeta } from "../auth.types.js";
import type { IAuthRepository } from "../repositories/auth.repository.interface.js";
import type { TokenService } from "../services/token.service.js";

export class VerifyEmailUseCase {
	constructor(private readonly deps: {
		authRepository: IAuthRepository;
		tokenService: TokenService;
		auditService: AuditRecorder;
	}) {}

	async execute(token: string, meta: RequestMeta = {}): Promise<{ verified: true }> {
		const { authRepository, tokenService } = this.deps;
		const record = await authRepository.findToken(tokenService.hash(token));
		if (!record || record.type !== "EMAIL_VERIFICATION" || record.consumedAt || record.expiresAt <= new Date()) {
			throw new ValidationError("Invalid or expired verification token");
		}
		if (!(await authRepository.consumeVerification(record.id, record.userId))) {
			throw new ValidationError("Verification token already used");
		}
		await this.deps.auditService.record({
			actorUserId: record.userId,
			action: "auth.email_verified",
			resourceType: "User",
			resourceId: record.userId,
			metadata: auditContext(meta),
		});
		return { verified: true };
	}
}
