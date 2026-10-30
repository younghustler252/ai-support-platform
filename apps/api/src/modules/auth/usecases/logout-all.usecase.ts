import type { SessionService } from "../services/session.service.js";

export class LogoutAllUseCase {
	constructor(private readonly deps: { sessionService: SessionService }) {}

	execute(userId: string) {
		return this.deps.sessionService.revokeAll(userId);
	}
}
