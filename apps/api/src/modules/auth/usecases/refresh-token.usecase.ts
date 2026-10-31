import type { RequestMeta, SessionTokens } from "../auth.types.js";
import type { SessionService } from "../services/session.service.js";

export class RefreshTokenUseCase {
	constructor(private readonly deps: { sessionService: SessionService }) {}

	execute(token: string, meta: RequestMeta = {}): Promise<SessionTokens> {
		return this.deps.sessionService.rotate(token, meta);
	}
}
