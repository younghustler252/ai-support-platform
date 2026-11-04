import type { Page } from "../../../foundation/utils/cursor.js";
import type {
	DeliveryWithEndpoint,
	EndpointInput,
	EndpointPatch,
	WebhookDeliveryView,
	WebhookEndpointSecretView,
	WebhookEndpointView,
} from "../webhook.types.js";

export interface IWebhookRepository {
	listEndpoints(applicationId: string): Promise<WebhookEndpointView[]>;
	findEndpoint(applicationId: string, endpointId: string): Promise<WebhookEndpointSecretView | null>;
	countEndpoints(applicationId: string): Promise<number>;
	createEndpoint(applicationId: string, input: EndpointInput): Promise<WebhookEndpointSecretView>;
	updateEndpoint(applicationId: string, endpointId: string, patch: EndpointPatch): Promise<WebhookEndpointSecretView | null>;
	rotateSecret(applicationId: string, endpointId: string): Promise<WebhookEndpointSecretView | null>;
	deleteEndpoint(applicationId: string, endpointId: string): Promise<boolean>;
	findSubscribed(applicationId: string, eventType: string): Promise<Array<{ id: string }>>;
	createDelivery(input: { endpointId: string; applicationId: string; eventType: string; payload: unknown }): Promise<WebhookDeliveryView>;
	findDelivery(deliveryId: string): Promise<DeliveryWithEndpoint | null>;
	findDeliveryForApplication(applicationId: string, endpointId: string, deliveryId: string): Promise<WebhookDeliveryView | null>;
	listDeliveries(applicationId: string, endpointId: string, query: { limit: number; cursor?: string }): Promise<Page<WebhookDeliveryView>>;
	recordAttempt(
		deliveryId: string,
		result: { status: "PENDING" | "SUCCEEDED" | "FAILED"; responseStatus: number | null; lastError: string | null },
	): Promise<void>;
	resetDelivery(deliveryId: string): Promise<void>;
	recordEndpointSuccess(endpointId: string): Promise<void>;
	recordEndpointFailure(endpointId: string): Promise<number>;
	disableEndpoint(endpointId: string, reason: string): Promise<void>;
}
