import { tenancyConfig } from "../../../config/tenancy.js";
import { logger } from "../../../foundation/logging/logger.js";
import { BlockedTargetError } from "../../../infrastructure/http/safe-http.js";
import { signPayload, webhookSecret } from "../domain/webhook-domain.js";
import type { IWebhookRepository } from "../repositories/webhook.repository.interface.js";
import type { WebhookHttpClient } from "../webhook-queue.js";

export type DeliveryOutcome = "delivered" | "failed" | "retry" | "skipped";

export class DeliverWebhookUseCase {
	constructor(
		private readonly deps: { webhookRepository: IWebhookRepository; webhookHttp: WebhookHttpClient },
		private readonly now: () => number = Date.now,
	) {}

	async execute(input: { deliveryId: string; final: boolean }): Promise<DeliveryOutcome> {
		const { webhookRepository, webhookHttp } = this.deps;
		const delivery = await webhookRepository.findDelivery(input.deliveryId);
		if (!delivery || delivery.status === "SUCCEEDED") return "skipped";
		if (!delivery.endpoint.enabled) {
			await webhookRepository.recordAttempt(delivery.id, { status: "FAILED", responseStatus: null, lastError: "Endpoint is disabled" });
			return "skipped";
		}

		const body = JSON.stringify(delivery.payload);
		const timestamp = Math.floor(this.now() / 1000);
		const secret = webhookSecret(delivery.endpoint.id, delivery.endpoint.secretVersion);

		let status: number | null = null;
		let retryable = true;
		let error: string | null = null;
		try {
			const response = await webhookHttp.post(delivery.endpoint.url, {
				timeoutMs: tenancyConfig.webhooks.timeoutMs,
				body,
				headers: {
					"Content-Type": "application/json",
					"User-Agent": "SupportAI-Webhooks/1.0",
					"X-SupportAI-Event": delivery.eventType,
					"X-SupportAI-Delivery": delivery.id,
					"X-SupportAI-Timestamp": String(timestamp),
					"X-SupportAI-Signature": signPayload(secret, timestamp, body),
				},
			});
			status = response.status;
			if (status >= 200 && status < 300) {
				await webhookRepository.recordAttempt(delivery.id, { status: "SUCCEEDED", responseStatus: status, lastError: null });
				await webhookRepository.recordEndpointSuccess(delivery.endpoint.id);
				return "delivered";
			}
			error = `Endpoint responded with status ${status}`;
			retryable = status === 408 || status === 429 || status >= 500;
		} catch (caught) {
			error = caught instanceof Error ? caught.message.slice(0, tenancyConfig.webhooks.errorMaxLength) : "Delivery failed";
			retryable = !(caught instanceof BlockedTargetError);
		}

		if (retryable && !input.final) {
			await webhookRepository.recordAttempt(delivery.id, { status: "PENDING", responseStatus: status, lastError: error });
			return "retry";
		}

		await webhookRepository.recordAttempt(delivery.id, { status: "FAILED", responseStatus: status, lastError: error });
		const failures = await webhookRepository.recordEndpointFailure(delivery.endpoint.id);
		if (status === 410 || failures >= tenancyConfig.webhooks.failureThreshold) {
			await webhookRepository.disableEndpoint(
				delivery.endpoint.id,
				status === 410 ? "The endpoint responded with 410 Gone" : "Disabled after too many consecutive failed deliveries",
			);
			logger.warn("webhook.endpoint_disabled", { endpointId: delivery.endpoint.id, applicationId: delivery.applicationId });
		}
		return "failed";
	}
}
