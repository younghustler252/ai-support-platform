import type { SessionService } from "../services/session.service.js";

export class GetCurrentUserUseCase {
	constructor(private readonly deps: { sessionService: SessionService }) {}

	execute(authorization?: string) {
		return this.deps.sessionService.authenticate(authorization);
	}
}
