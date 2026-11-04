import { randomUUID } from "node:crypto";

import { logger } from "../../foundation/logging/logger.js";
import type { ConversationView, MessageView } from "../conversations/conversation.types.js";
import { webhookEventFor } from "./domain/webhook-domain.js";
import type { IWebhookRepository } from "./repositories/webhook.repository.interface.js";
import type { DeliverWebhookUseCase } from "./usecases/deliver-webhook.usecase.js";
import type { WebhookQueue } from "./webhook-queue.js";

export interface IWebhookDispatcher {
	conversationEvent(applicationId: string, conversation: ConversationView, internalEvent: string | null): Promise<void>;
	messageEvent(applicationId: string, message: MessageView): Promise<void>;
}

export class WebhookDispatcher implements IWebhookDispatcher {
	constructor(
		private readonly deps: { webhookRepository: IWebhookRepository; webhookQueue: WebhookQueue | null; deliverWebhookUseCase: DeliverWebhookUseCase },
	) {}

	async conversationEvent(applicationId: string, conversation: ConversationView, internalEvent: string | null): Promise<void> {
		const type = webhookEventFor(internalEvent);
		if (!type) return;
		await this.dispatch(applicationId, type, {
			conversation: {
				id: conversation.id,
				status: conversation.status,
				subject: conversation.subject,
				customerExternalId: conversation.customer.externalId,
				assigneeUserId: conversation.assigneeUserId,
				createdAt: conversation.createdAt,
				updatedAt: conversation.updatedAt,
			},
		});
	}

	async messageEvent(applicationId: string, message: MessageView): Promise<void> {
		if (message.internal || message.sender === "SYSTEM") return;
		await this.dispatch(applicationId, "message.created", {
			message: {
				id: message.id,
				conversationId: message.conversationId,
				sender: message.sender,
				body: message.body,
				createdAt: message.createdAt,
			},
		});
	}

	async dispatch(applicationId: string, type: string, data: unknown): Promise<void> {
		try {
			const endpoints = await this.deps.webhookRepository.findSubscribed(applicationId, type);
			for (const endpoint of endpoints) await this.sendTo(endpoint.id, applicationId, type, data);
		} catch (error) {
			logger.warn("webhook.dispatch_failed", { applicationId, type, error });
		}
	}

	async sendTo(endpointId: string, applicationId: string, type: string, data: unknown): Promise<string> {
		const delivery = await this.deps.webhookRepository.createDelivery({
			endpointId,
			applicationId,
			eventType: type,
			payload: { id: randomUUID(), type, createdAt: new Date().toISOString(), applicationId, data },
		});
		await this.schedule(delivery.id);
		return delivery.id;
	}

	async schedule(deliveryId: string): Promise<void> {
		const { webhookQueue, deliverWebhookUseCase } = this.deps;
		if (webhookQueue) {
			await webhookQueue.enqueue(deliveryId);
			return;
		}
		void deliverWebhookUseCase.execute({ deliveryId, final: true }).catch((error: unknown) => {
			logger.warn("webhook.inline_delivery_failed", { deliveryId, error });
		});
	}
}
