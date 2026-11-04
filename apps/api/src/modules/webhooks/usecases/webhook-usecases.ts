import { tenancyConfig } from "../../../config/tenancy.js";
import { ConflictError, LimitExceededError, NotFoundError } from "../../../foundation/errors/app-error.js";
import type { Page } from "../../../foundation/utils/cursor.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import { webhookSecret } from "../domain/webhook-domain.js";
import type { IWebhookRepository } from "../repositories/webhook.repository.interface.js";
import type { EndpointPatch, WebhookDeliveryView, WebhookEndpointSecretView, WebhookEndpointView } from "../webhook.types.js";
import type { WebhookDispatcher } from "../webhook-dispatcher.js";

interface Scope {
	organizationId: string;
	applicationId: string;
	actorId: string;
}

export function publicEndpoint(endpoint: WebhookEndpointSecretView | WebhookEndpointView): WebhookEndpointView {
	const { secretVersion: _secretVersion, ...rest } = endpoint as WebhookEndpointSecretView;
	return rest;
}

async function audit(auditService: AuditRecorder, scope: Scope, action: string, endpointId: string, meta: RequestMeta): Promise<void> {
	await auditService.record({
		actorUserId: scope.actorId,
		action,
		resourceType: "WebhookEndpoint",
		resourceId: endpointId,
		metadata: auditMetadata(meta, { organizationId: scope.organizationId, applicationId: scope.applicationId }),
	});
}

export class ListWebhooksUseCase {
	constructor(private readonly deps: { webhookRepository: IWebhookRepository }) {}

	execute(applicationId: string): Promise<WebhookEndpointView[]> {
		return this.deps.webhookRepository.listEndpoints(applicationId);
	}
}

export class GetWebhookUseCase {
	constructor(private readonly deps: { webhookRepository: IWebhookRepository }) {}

	async execute(applicationId: string, endpointId: string): Promise<WebhookEndpointView> {
		const endpoint = await this.deps.webhookRepository.findEndpoint(applicationId, endpointId);
		if (!endpoint) throw new NotFoundError("Webhook not found");
		return publicEndpoint(endpoint);
	}
}

export class CreateWebhookUseCase {
	constructor(private readonly deps: { webhookRepository: IWebhookRepository; auditService: AuditRecorder }) {}

	async execute(
		input: Scope & { url: string; events: Array<import("../domain/webhook-domain.js").WebhookEvent>; description?: string },
		meta: RequestMeta = {},
	): Promise<{ endpoint: WebhookEndpointView; secret: string }> {
		const { webhookRepository, auditService } = this.deps;
		if ((await webhookRepository.countEndpoints(input.applicationId)) >= tenancyConfig.limits.webhooksPerApplication) {
			throw new LimitExceededError("This application has reached its webhook limit");
		}
		const endpoint = await webhookRepository.createEndpoint(input.applicationId, {
			url: input.url,
			events: input.events,
			description: input.description ?? null,
		});
		await audit(auditService, input, "webhook.created", endpoint.id, meta);
		return { endpoint: publicEndpoint(endpoint), secret: webhookSecret(endpoint.id, endpoint.secretVersion) };
	}
}

export class UpdateWebhookUseCase {
	constructor(private readonly deps: { webhookRepository: IWebhookRepository; auditService: AuditRecorder }) {}

	async execute(input: Scope & { endpointId: string; patch: EndpointPatch }, meta: RequestMeta = {}): Promise<WebhookEndpointView> {
		const endpoint = await this.deps.webhookRepository.updateEndpoint(input.applicationId, input.endpointId, input.patch);
		if (!endpoint) throw new NotFoundError("Webhook not found");
		await audit(this.deps.auditService, input, "webhook.updated", endpoint.id, meta);
		return publicEndpoint(endpoint);
	}
}

export class RotateWebhookSecretUseCase {
	constructor(private readonly deps: { webhookRepository: IWebhookRepository; auditService: AuditRecorder }) {}

	async execute(input: Scope & { endpointId: string }, meta: RequestMeta = {}): Promise<{ endpoint: WebhookEndpointView; secret: string }> {
		const endpoint = await this.deps.webhookRepository.rotateSecret(input.applicationId, input.endpointId);
		if (!endpoint) throw new NotFoundError("Webhook not found");
		await audit(this.deps.auditService, input, "webhook.secret_rotated", endpoint.id, meta);
		return { endpoint: publicEndpoint(endpoint), secret: webhookSecret(endpoint.id, endpoint.secretVersion) };
	}
}

export class DeleteWebhookUseCase {
	constructor(private readonly deps: { webhookRepository: IWebhookRepository; auditService: AuditRecorder }) {}

	async execute(input: Scope & { endpointId: string }, meta: RequestMeta = {}): Promise<void> {
		if (!(await this.deps.webhookRepository.deleteEndpoint(input.applicationId, input.endpointId))) throw new NotFoundError("Webhook not found");
		await audit(this.deps.auditService, input, "webhook.deleted", input.endpointId, meta);
	}
}

export class ListWebhookDeliveriesUseCase {
	constructor(private readonly deps: { webhookRepository: IWebhookRepository }) {}

	async execute(input: { applicationId: string; endpointId: string; limit: number; cursor?: string }): Promise<Page<WebhookDeliveryView>> {
		const { webhookRepository } = this.deps;
		if (!(await webhookRepository.findEndpoint(input.applicationId, input.endpointId))) throw new NotFoundError("Webhook not found");
		return webhookRepository.listDeliveries(input.applicationId, input.endpointId, { limit: input.limit, cursor: input.cursor });
	}
}

export class TestWebhookUseCase {
	constructor(private readonly deps: { webhookRepository: IWebhookRepository; webhookDispatcher: WebhookDispatcher }) {}

	async execute(input: { applicationId: string; endpointId: string }): Promise<{ deliveryId: string }> {
		const endpoint = await this.deps.webhookRepository.findEndpoint(input.applicationId, input.endpointId);
		if (!endpoint) throw new NotFoundError("Webhook not found");
		if (!endpoint.enabled) throw new ConflictError("Enable the webhook before sending a test event");
		const deliveryId = await this.deps.webhookDispatcher.sendTo(endpoint.id, input.applicationId, "webhook.test", { message: "This is a test event from SupportAI" });
		return { deliveryId };
	}
}

export class RedeliverWebhookUseCase {
	constructor(private readonly deps: { webhookRepository: IWebhookRepository; webhookDispatcher: WebhookDispatcher }) {}

	async execute(input: { applicationId: string; endpointId: string; deliveryId: string }): Promise<void> {
		const { webhookRepository, webhookDispatcher } = this.deps;
		const endpoint = await webhookRepository.findEndpoint(input.applicationId, input.endpointId);
		if (!endpoint) throw new NotFoundError("Webhook not found");
		const delivery = await webhookRepository.findDeliveryForApplication(input.applicationId, input.endpointId, input.deliveryId);
		if (!delivery) throw new NotFoundError("Delivery not found");
		if (!endpoint.enabled) throw new ConflictError("Enable the webhook before redelivering");
		if (delivery.status === "PENDING") throw new ConflictError("This delivery is still in progress");
		await webhookRepository.resetDelivery(delivery.id);
		await webhookDispatcher.schedule(delivery.id);
	}
}
