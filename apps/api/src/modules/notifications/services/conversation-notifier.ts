import { tenancyConfig } from "../../../config/tenancy.js";
import { logger } from "../../../foundation/logging/logger.js";
import { conversationNotificationEmail } from "../../../infrastructure/email/auth-email.templates.js";
import type { EmailQueue } from "../../../infrastructure/email/in-process-email-queue.js";
import type { ConversationView } from "../../conversations/conversation.types.js";
import type { NotificationRecipient } from "../notification.types.js";
import type { INotificationRepository } from "../repositories/notification.repository.interface.js";

export interface IConversationNotifier {
	conversationEvent(applicationId: string, conversation: ConversationView, internalEvent: string | null): Promise<void>;
}

type Kind = "assigned" | "escalated";

function kindOf(event: string | null): Kind | null {
	if (event === "assigned" || event === "reassigned" || event === "transferred") return "assigned";
	if (event === "escalated") return "escalated";
	return null;
}

export class ConversationNotifier implements IConversationNotifier {
	constructor(private readonly deps: { notificationRepository: INotificationRepository; emailQueue: EmailQueue }) {}

	async conversationEvent(applicationId: string, conversation: ConversationView, internalEvent: string | null): Promise<void> {
		const kind = kindOf(internalEvent);
		if (!kind) return;
		try {
			await this.notify(applicationId, conversation, kind);
		} catch (error) {
			logger.warn("notification.failed", { applicationId, conversationId: conversation.id, error });
		}
	}

	private async notify(applicationId: string, conversation: ConversationView, kind: Kind): Promise<void> {
		const { notificationRepository, emailQueue } = this.deps;
		const application = await notificationRepository.findApplicationInfo(applicationId);
		if (!application) return;

		let recipients: NotificationRecipient[] = [];
		if (kind === "assigned") {
			if (!conversation.assigneeUserId) return;
			const recipient = await notificationRepository.findUserRecipient(conversation.assigneeUserId);
			recipients = recipient ? [recipient] : [];
		} else {
			recipients = await notificationRepository.findAdminRecipients(applicationId, application.organizationId, tenancyConfig.notifications.maxRecipients);
		}
		if (recipients.length === 0) return;

		const subject = conversation.subject ? conversation.subject.slice(0, tenancyConfig.notifications.subjectMaxLength) : null;
		await notificationRepository.createMany(
			recipients.map((recipient) => ({
				recipientUserId: recipient.userId,
				applicationId,
				type: `conversation.${kind}`,
				payload: { conversationId: conversation.id, subject },
			})),
		);

		const content = conversationNotificationEmail({
			kind,
			applicationName: application.name,
			subject,
			applicationId,
			conversationId: conversation.id,
		});
		for (const recipient of recipients) {
			if (!recipient.emailEnabled) continue;
			await emailQueue.enqueue({ to: recipient.email, ...content }).catch((error: unknown) => {
				logger.warn("notification.email_failed", { applicationId, error });
			});
		}
	}
}
