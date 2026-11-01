import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import type { ConversationView } from "../conversation.types.js";
import type { IConversationRepository } from "../repositories/conversation.repository.interface.js";
import { restrictedTo } from "./conversation-access.js";
import { runTransition, type TransitionInput } from "./run-transition.js";

export class CloseConversationUseCase {
	constructor(private readonly deps: { conversationRepository: IConversationRepository; auditService: AuditRecorder }) {}

	execute(input: TransitionInput, meta: RequestMeta = {}): Promise<ConversationView> {
		return runTransition(
			this.deps,
			{ ...input, restrictedTo: restrictedTo(input.actor, "conversation.resolve") },
			{ type: "close" },
			meta,
		);
	}
}
