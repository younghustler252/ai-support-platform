import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import type { Authorizer } from "../../tenancy/services/authorizer.service.js";
import type { ConversationView } from "../conversation.types.js";
import type { IConversationRepository } from "../repositories/conversation.repository.interface.js";
import { assertEligibleAgent, restrictedTo, type ConversationActor } from "./conversation-access.js";
import { runTransition, type TransitionInput } from "./run-transition.js";

export class TransferConversationUseCase {
	constructor(private readonly deps: {
		conversationRepository: IConversationRepository;
		auditService: AuditRecorder;
		authorizer: Authorizer;
	}) {}

	async execute(input: TransitionInput & { targetUserId: string; actor: ConversationActor }, meta: RequestMeta = {}): Promise<ConversationView> {
		await assertEligibleAgent(this.deps.authorizer, {
			userId: input.targetUserId,
			organizationId: input.organizationId,
			applicationId: input.applicationId,
		});
		return runTransition(
			this.deps,
			{ ...input, restrictedTo: restrictedTo(input.actor, "conversation.transfer") },
			{ type: "transfer", agentId: input.targetUserId },
			meta,
		);
	}
}
