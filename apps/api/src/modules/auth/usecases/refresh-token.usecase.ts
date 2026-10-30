import type { SessionService } from "../services/session.service.js";

export class RefreshTokenUseCase {
	constructor(private readonly deps: { sessionService: SessionService }) {}

	execute(token: string, userAgent?: string) {
		return this.deps.sessionService.rotate(token, userAgent);
	}
}
