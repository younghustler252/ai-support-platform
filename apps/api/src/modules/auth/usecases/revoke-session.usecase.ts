import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import { auditContext, type RequestMeta } from "../auth.types.js";
import type { SessionService } from "../services/session.service.js";

export class RevokeSessionUseCase {
	constructor(private readonly deps: { sessionService: SessionService; auditService: AuditRecorder }) {}

	async execute(
		userId: string,
		sessionId: string,
		currentSessionId: string,
		meta: RequestMeta = {},
	): Promise<{ revoked: true; current: boolean }> {
		if (!(await this.deps.sessionService.revokeOwned(userId, sessionId))) {
			throw new NotFoundError("Session not found");
		}
		await this.deps.auditService.record({
			actorUserId: userId,
			action: "auth.session.revoked",
			resourceType: "AuthSession",
			resourceId: sessionId,
			metadata: auditContext(meta),
		});
		return { revoked: true, current: sessionId === currentSessionId };
	}
}
