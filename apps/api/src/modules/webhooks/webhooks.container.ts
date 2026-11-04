import { asClass, asFunction, asValue, type AwilixContainer } from "awilix";

import { env } from "../../config/env.js";
import { postJson } from "../../infrastructure/http/safe-http.js";
import { createWebhookQueue } from "../../infrastructure/queue/queue-factories.js";
import { WebhookController } from "./controllers/webhook.controller.js";
import { WebhookRepositoryImpl } from "./repositories/webhook.repository.impl.js";
import { DeliverWebhookUseCase } from "./usecases/deliver-webhook.usecase.js";
import {
	CreateWebhookUseCase,
	DeleteWebhookUseCase,
	GetWebhookUseCase,
	ListWebhookDeliveriesUseCase,
	ListWebhooksUseCase,
	RedeliverWebhookUseCase,
	RotateWebhookSecretUseCase,
	TestWebhookUseCase,
	UpdateWebhookUseCase,
} from "./usecases/webhook-usecases.js";
import { WebhookDispatcher } from "./webhook-dispatcher.js";

export function registerWebhooks(container: AwilixContainer): void {
	container.register({
		webhookHttp: asValue({
			post: (url: string, options: { headers: Record<string, string>; body: string; timeoutMs: number }) =>
				postJson(url, { ...options, allowPrivate: env.WEBHOOK_ALLOW_PRIVATE_TARGETS === "true" }),
		}),
		webhookQueue: asFunction(createWebhookQueue).singleton(),
		webhookRepository: asClass(WebhookRepositoryImpl).scoped(),
		deliverWebhookUseCase: asClass(DeliverWebhookUseCase).scoped(),
		webhookDispatcher: asClass(WebhookDispatcher).scoped(),
		listWebhooksUseCase: asClass(ListWebhooksUseCase).scoped(),
		getWebhookUseCase: asClass(GetWebhookUseCase).scoped(),
		createWebhookUseCase: asClass(CreateWebhookUseCase).scoped(),
		updateWebhookUseCase: asClass(UpdateWebhookUseCase).scoped(),
		rotateWebhookSecretUseCase: asClass(RotateWebhookSecretUseCase).scoped(),
		deleteWebhookUseCase: asClass(DeleteWebhookUseCase).scoped(),
		listWebhookDeliveriesUseCase: asClass(ListWebhookDeliveriesUseCase).scoped(),
		testWebhookUseCase: asClass(TestWebhookUseCase).scoped(),
		redeliverWebhookUseCase: asClass(RedeliverWebhookUseCase).scoped(),
		webhookController: asClass(WebhookController).scoped(),
	});
}
