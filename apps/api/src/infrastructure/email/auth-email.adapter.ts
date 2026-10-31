import type { AuthEmailPort } from "../../modules/auth/services/auth-email.port.js";
import { passwordChangedEmail, passwordResetEmail, verificationEmail } from "./auth-email.templates.js";
import type { EmailQueue } from "./in-process-email-queue.js";

export class AuthEmailAdapter implements AuthEmailPort {
	constructor(private readonly deps: { emailQueue: EmailQueue }) {}

	sendVerification(email: string, token: string): Promise<void> {
		return this.deps.emailQueue.enqueue({ to: email, ...verificationEmail(token) });
	}

	sendPasswordReset(email: string, token: string): Promise<void> {
		return this.deps.emailQueue.enqueue({ to: email, ...passwordResetEmail(token) });
	}

	sendPasswordChanged(email: string): Promise<void> {
		return this.deps.emailQueue.enqueue({ to: email, ...passwordChangedEmail() });
	}
}
