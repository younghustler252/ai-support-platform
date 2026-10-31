import { AuthenticationError, ForbiddenError, ValidationError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import { auditContext, type RequestMeta } from "../auth.types.js";
import { logEmailFailure } from "../auth.utils.js";
import type { IAuthRepository } from "../repositories/auth.repository.interface.js";
import type { AuthEmailPort } from "../services/auth-email.port.js";
import type { PasswordService } from "../services/password.service.js";

interface ChangePasswordInput {
	userId: string;
	sessionId: string;
	currentPassword: string;
	newPassword: string;
}

export class ChangePasswordUseCase {
	constructor(private readonly deps: {
		authRepository: IAuthRepository;
		passwordService: PasswordService;
		authEmailService: AuthEmailPort;
		auditService: AuditRecorder;
	}) {}

	async execute(input: ChangePasswordInput, meta: RequestMeta = {}): Promise<{ changed: true }> {
		const { authRepository, passwordService, auditService } = this.deps;

		const user = await authRepository.findById(input.userId);
		if (!user || user.disabledAt) throw new AuthenticationError();
		if (!user.passwordHash) throw new ForbiddenError("Password sign-in is not enabled for this account");

		if (!(await passwordService.verify(user.passwordHash, input.currentPassword))) {
			await auditService.record({
				actorUserId: user.id,
				action: "auth.password.change_failed",
				resourceType: "User",
				resourceId: user.id,
				metadata: auditContext(meta),
			});
			throw new ValidationError("Current password is incorrect", {
				issues: [{ path: "currentPassword", code: "invalid", message: "Current password is incorrect" }],
			});
		}

		const passwordHash = await passwordService.hash(input.newPassword);
		await authRepository.changePassword(user.id, passwordHash, input.sessionId);
		await auditService.record({
			actorUserId: user.id,
			action: "auth.password.changed",
			resourceType: "User",
			resourceId: user.id,
			metadata: auditContext(meta),
		});
		await this.deps.authEmailService.sendPasswordChanged(user.email).catch(logEmailFailure("password-change-notice"));

		return { changed: true };
	}
}
