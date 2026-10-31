import type { InvitationEmailInput, InvitationEmailPort } from "../../modules/memberships/services/invitation-email.port.js";
import { invitationEmail } from "./auth-email.templates.js";
import type { EmailQueue } from "./in-process-email-queue.js";

export class InvitationEmailAdapter implements InvitationEmailPort {
	constructor(private readonly deps: { emailQueue: EmailQueue }) {}

	sendInvitation(email: string, input: InvitationEmailInput): Promise<void> {
		return this.deps.emailQueue.enqueue({ to: email, ...invitationEmail(input) });
	}
}
