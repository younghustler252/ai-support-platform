import type { Request, Response } from "express";

import { validatedQuery } from "../../../foundation/http/locals.js";
import { authContext, requestMeta, validatedBody, validatedParams } from "../../auth/http/auth-http.js";
import { tenantContext } from "../../tenancy/http/tenant-http.js";
import type {
	CreateWebhookUseCase,
	DeleteWebhookUseCase,
	GetWebhookUseCase,
	ListWebhookDeliveriesUseCase,
	ListWebhooksUseCase,
	RedeliverWebhookUseCase,
	RotateWebhookSecretUseCase,
	TestWebhookUseCase,
	UpdateWebhookUseCase,
} from "../usecases/webhook-usecases.js";
import type {
	CreateWebhookInput,
	DeliveryParams,
	ListDeliveriesQuery,
	UpdateWebhookInput,
	WebhookParams,
} from "../validators/webhook.validator.js";

interface Dependencies {
	listWebhooksUseCase: ListWebhooksUseCase;
	getWebhookUseCase: GetWebhookUseCase;
	createWebhookUseCase: CreateWebhookUseCase;
	updateWebhookUseCase: UpdateWebhookUseCase;
	rotateWebhookSecretUseCase: RotateWebhookSecretUseCase;
	deleteWebhookUseCase: DeleteWebhookUseCase;
	listWebhookDeliveriesUseCase: ListWebhookDeliveriesUseCase;
	testWebhookUseCase: TestWebhookUseCase;
	redeliverWebhookUseCase: RedeliverWebhookUseCase;
}

function scopeOf(response: Response) {
	const { user } = authContext(response);
	const { organizationId, applicationId } = tenantContext(response);
	return { organizationId, applicationId: applicationId as string, actorId: user.id };
}

export class WebhookController {
	constructor(private readonly deps: Dependencies) {}

	list = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		response.json({ data: { webhooks: await this.deps.listWebhooksUseCase.execute(applicationId as string) } });
	};

	get = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		const { endpointId } = validatedParams<WebhookParams>(response);
		response.json({ data: { webhook: await this.deps.getWebhookUseCase.execute(applicationId as string, endpointId) } });
	};

	create = async (request: Request, response: Response): Promise<void> => {
		const input = validatedBody<CreateWebhookInput>(response);
		const { endpoint, secret } = await this.deps.createWebhookUseCase.execute({ ...scopeOf(response), ...input }, requestMeta(request));
		response.status(201).json({ data: { webhook: endpoint, secret } });
	};

	update = async (request: Request, response: Response): Promise<void> => {
		const { endpointId } = validatedParams<WebhookParams>(response);
		const patch = validatedBody<UpdateWebhookInput>(response);
		const webhook = await this.deps.updateWebhookUseCase.execute({ ...scopeOf(response), endpointId, patch }, requestMeta(request));
		response.json({ data: { webhook } });
	};

	rotateSecret = async (request: Request, response: Response): Promise<void> => {
		const { endpointId } = validatedParams<WebhookParams>(response);
		const { endpoint, secret } = await this.deps.rotateWebhookSecretUseCase.execute({ ...scopeOf(response), endpointId }, requestMeta(request));
		response.json({ data: { webhook: endpoint, secret } });
	};

	remove = async (request: Request, response: Response): Promise<void> => {
		const { endpointId } = validatedParams<WebhookParams>(response);
		await this.deps.deleteWebhookUseCase.execute({ ...scopeOf(response), endpointId }, requestMeta(request));
		response.status(204).end();
	};

	listDeliveries = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		const { endpointId } = validatedParams<WebhookParams>(response);
		const { limit, cursor } = validatedQuery<ListDeliveriesQuery>(response);
		const page = await this.deps.listWebhookDeliveriesUseCase.execute({ applicationId: applicationId as string, endpointId, limit, cursor });
		response.json({ data: { deliveries: page.items }, meta: { nextCursor: page.nextCursor } });
	};

	test = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		const { endpointId } = validatedParams<WebhookParams>(response);
		const result = await this.deps.testWebhookUseCase.execute({ applicationId: applicationId as string, endpointId });
		response.status(202).json({ data: result });
	};

	redeliver = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		const { endpointId, deliveryId } = validatedParams<DeliveryParams>(response);
		await this.deps.redeliverWebhookUseCase.execute({ applicationId: applicationId as string, endpointId, deliveryId });
		response.status(202).json({ data: { deliveryId } });
	};
}
