import type { SessionService } from "../services/session.service.js";

export class LogoutUseCase {
	constructor(private readonly deps: { sessionService: SessionService }) {}

	execute(token: string) {
		return this.deps.sessionService.revoke(token);
	}
}
