import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import type { ConversationView } from "../conversation.types.js";
import type { IConversationRepository } from "../repositories/conversation.repository.interface.js";
import { runTransition, type TransitionInput } from "./run-transition.js";

export class ClaimConversationUseCase {
	constructor(private readonly deps: { conversationRepository: IConversationRepository; auditService: AuditRecorder }) {}

	execute(input: TransitionInput, meta: RequestMeta = {}): Promise<ConversationView> {
		return runTransition(this.deps, input, { type: "claim", agentId: input.actor.id }, meta);
	}
}
