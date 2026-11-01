import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { ConversationCommand } from "../domain/conversation-state.js";
import type { ConversationView } from "../conversation.types.js";
import type { IConversationRepository } from "../repositories/conversation.repository.interface.js";
import { unwrapTransition, type ConversationActor } from "./conversation-access.js";

export interface TransitionInput {
	organizationId: string;
	applicationId: string;
	conversationId: string;
	actor: ConversationActor;
	restrictedTo?: string;
	note?: string;
	targetUserId?: string;
}

export async function runTransition(
	deps: { conversationRepository: IConversationRepository; auditService: AuditRecorder },
	input: TransitionInput,
	command: ConversationCommand,
	meta: RequestMeta,
): Promise<ConversationView> {
	const result = unwrapTransition(
		await deps.conversationRepository.apply(input.applicationId, input.conversationId, command, {
			actorId: input.actor.id,
			requireAssignee: input.restrictedTo,
			note: input.note,
		}),
	);

	if (result.changed && result.event) {
		await deps.auditService.record({
			actorUserId: input.actor.id,
			action: `conversation.${result.event}`,
			resourceType: "Conversation",
			resourceId: input.conversationId,
			metadata: auditMetadata(meta, {
				organizationId: input.organizationId,
				applicationId: input.applicationId,
				...(input.targetUserId ? { targetUserId: input.targetUserId } : {}),
			}),
		});
	}
	return result.conversation;
}
