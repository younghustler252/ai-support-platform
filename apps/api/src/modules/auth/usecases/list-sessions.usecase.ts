import type { ActiveSessionSummary } from "../repositories/session.repository.js";
import type { SessionService } from "../services/session.service.js";

export interface SessionView extends ActiveSessionSummary {
	current: boolean;
}

export class ListSessionsUseCase {
	constructor(private readonly deps: { sessionService: SessionService }) {}

	async execute(userId: string, currentSessionId: string): Promise<SessionView[]> {
		const sessions = await this.deps.sessionService.listActive(userId);
		return sessions.map((session) => ({ ...session, current: session.id === currentSessionId }));
	}
}
