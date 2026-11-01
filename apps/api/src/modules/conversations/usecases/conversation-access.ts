import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../../foundation/errors/app-error.js";
import { scopeCovers } from "../../rbac/permission-catalog.js";
import type { Authorizer } from "../../tenancy/services/authorizer.service.js";
import type { ApplicationAction } from "../../tenancy/policies.js";
import type { EffectiveGrants } from "../../tenancy/tenancy.types.js";
import type { ConversationView, TransitionResult } from "../conversation.types.js";

export interface ConversationActor {
	id: string;
	grants: EffectiveGrants;
}

export function restrictedTo(actor: ConversationActor, code: string): string | undefined {
	return scopeCovers(actor.grants[code], "APPLICATION") ? undefined : actor.id;
}

export function assertVisible(conversation: ConversationView, restrictedTo: string | undefined): void {
	if (restrictedTo && conversation.assigneeUserId !== restrictedTo) throw new NotFoundError("Conversation not found");
}

export function unwrapTransition(result: TransitionResult): { conversation: ConversationView; changed: boolean; event: string | null } {
	switch (result.result) {
		case "ok":
			return result;
		case "invalid":
			throw new ConflictError(result.reason);
		default:
			throw new NotFoundError("Conversation not found");
	}
}

export async function assertEligibleAgent(
	authorizer: Authorizer,
	input: { userId: string; organizationId: string; applicationId: string },
): Promise<void> {
	const action: ApplicationAction = "conversation.reply";
	try {
		await authorizer.application(input.userId, input.organizationId, input.applicationId, action);
	} catch (error) {
		if (error instanceof NotFoundError || error instanceof ForbiddenError) {
			throw new ValidationError("That user cannot handle conversations in this application");
		}
		throw error;
	}
}
