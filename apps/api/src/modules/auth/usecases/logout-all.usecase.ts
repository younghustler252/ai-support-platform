import type { AuditRecorder } from "../../audit/services/audit.service.js";
import { auditContext, type RequestMeta } from "../auth.types.js";
import type { SessionService } from "../services/session.service.js";

export class LogoutAllUseCase {
	constructor(private readonly deps: { sessionService: SessionService; auditService: AuditRecorder }) {}

	async execute(userId: string, meta: RequestMeta = {}): Promise<{ loggedOut: true }> {
		await this.deps.sessionService.revokeAll(userId, "LOGOUT_ALL");
		await this.deps.auditService.record({
			actorUserId: userId,
			action: "auth.logout_all",
			resourceType: "User",
			resourceId: userId,
			metadata: auditContext(meta),
		});
		return { loggedOut: true };
	}
}
