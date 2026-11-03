import { tenancyConfig } from "../../../config/tenancy.js";
import { LimitExceededError } from "../../../foundation/errors/app-error.js";
import type { ICustomerRepository } from "../../customers/repositories/customer.repository.interface.js";
import { scheduleSafely, type AiReplyScheduler } from "../../ai/ai-reply-scheduler.js";
import type { ConversationView, MessageView } from "../conversation.types.js";
import type { IConversationRepository } from "../repositories/conversation.repository.interface.js";

interface Input {
	applicationId: string;
	customer: { externalId: string; displayName?: string; email?: string };
	subject?: string;
	message: string;
}

export class StartConversationUseCase {
	constructor(private readonly deps: {
		conversationRepository: IConversationRepository;
		customerRepository: ICustomerRepository;
		aiReplyScheduler: AiReplyScheduler;
	}) {}

	async execute(input: Input): Promise<{ conversation: ConversationView; message: MessageView }> {
		const { conversationRepository, customerRepository } = this.deps;

		const customer = await customerRepository.upsertByExternalId(input.applicationId, input.customer.externalId, {
			displayName: input.customer.displayName,
			email: input.customer.email,
		});
		if ((await conversationRepository.countOpenForCustomer(input.applicationId, customer.id)) >= tenancyConfig.limits.openConversationsPerCustomer) {
			throw new LimitExceededError("This customer already has the maximum number of open conversations");
		}
		const created = await conversationRepository.createWithMessage(input.applicationId, {
			customerId: customer.id,
			subject: input.subject ?? null,
			body: input.message,
		});
		await scheduleSafely(this.deps.aiReplyScheduler, {
			applicationId: input.applicationId,
			conversationId: created.conversation.id,
			messageId: created.message.id,
		});
		return created;
	}
}
