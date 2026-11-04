import type { WebhookEvent } from "./domain/webhook-domain.js";

export interface WebhookEndpointView {
	id: string;
	applicationId: string;
	url: string;
	description: string | null;
	events: string[];
	enabled: boolean;
	disabledReason: string | null;
	consecutiveFailures: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface WebhookEndpointSecretView extends WebhookEndpointView {
	secretVersion: number;
}

export type DeliveryStatus = "PENDING" | "SUCCEEDED" | "FAILED";

export interface WebhookDeliveryView {
	id: string;
	endpointId: string;
	applicationId: string;
	eventType: string;
	status: DeliveryStatus;
	attempts: number;
	responseStatus: number | null;
	lastError: string | null;
	createdAt: Date;
	deliveredAt: Date | null;
}

export interface DeliveryWithEndpoint extends WebhookDeliveryView {
	payload: unknown;
	endpoint: { id: string; url: string; enabled: boolean; secretVersion: number };
}

export interface EndpointInput {
	url: string;
	description?: string | null;
	events: WebhookEvent[];
}

export interface EndpointPatch {
	url?: string;
	description?: string | null;
	events?: WebhookEvent[];
	enabled?: boolean;
}
