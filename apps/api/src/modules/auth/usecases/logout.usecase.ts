import type { RequestMeta } from "../auth.types.js";
import type { SessionService } from "../services/session.service.js";

export class LogoutUseCase {
	constructor(private readonly deps: { sessionService: SessionService }) {}

	async execute(token: string, meta: RequestMeta = {}): Promise<{ loggedOut: true }> {
		await this.deps.sessionService.revoke(token, meta);
		return { loggedOut: true };
	}
}
