import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import { decodeCursor, toPage, type Page } from "../../../foundation/utils/cursor.js";
import type {
	DeliveryWithEndpoint,
	EndpointInput,
	EndpointPatch,
	WebhookDeliveryView,
	WebhookEndpointSecretView,
} from "../webhook.types.js";
import type { IWebhookRepository } from "./webhook.repository.interface.js";

const endpointSelect = {
	id: true,
	applicationId: true,
	url: true,
	description: true,
	events: true,
	enabled: true,
	disabledReason: true,
	consecutiveFailures: true,
	secretVersion: true,
	createdAt: true,
	updatedAt: true,
} as const;

const deliverySelect = {
	id: true,
	endpointId: true,
	applicationId: true,
	eventType: true,
	status: true,
	attempts: true,
	responseStatus: true,
	lastError: true,
	createdAt: true,
	deliveredAt: true,
} as const;

export class WebhookRepositoryImpl implements IWebhookRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	private get db(): PrismaClient {
		return this.deps.prisma;
	}

	async listEndpoints(applicationId: string) {
		const rows = await this.db.webhookEndpoint.findMany({ where: { applicationId }, select: endpointSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
		return rows.map(({ secretVersion: _secretVersion, ...row }) => row);
	}

	findEndpoint(applicationId: string, endpointId: string): Promise<WebhookEndpointSecretView | null> {
		return this.db.webhookEndpoint.findFirst({ where: { id: endpointId, applicationId }, select: endpointSelect });
	}

	countEndpoints(applicationId: string): Promise<number> {
		return this.db.webhookEndpoint.count({ where: { applicationId } });
	}

	createEndpoint(applicationId: string, input: EndpointInput): Promise<WebhookEndpointSecretView> {
		return this.db.webhookEndpoint.create({
			data: { applicationId, url: input.url, description: input.description ?? null, events: input.events },
			select: endpointSelect,
		});
	}

	async updateEndpoint(applicationId: string, endpointId: string, patch: EndpointPatch): Promise<WebhookEndpointSecretView | null> {
		const result = await this.db.webhookEndpoint.updateMany({
			where: { id: endpointId, applicationId },
			data: {
				...(patch.url !== undefined ? { url: patch.url } : {}),
				...(patch.description !== undefined ? { description: patch.description } : {}),
				...(patch.events !== undefined ? { events: patch.events } : {}),
				...(patch.enabled !== undefined
					? { enabled: patch.enabled, ...(patch.enabled ? { disabledReason: null, consecutiveFailures: 0 } : {}) }
					: {}),
				updatedAt: new Date(),
			},
		});
		return result.count > 0 ? this.findEndpoint(applicationId, endpointId) : null;
	}

	async rotateSecret(applicationId: string, endpointId: string): Promise<WebhookEndpointSecretView | null> {
		const result = await this.db.webhookEndpoint.updateMany({
			where: { id: endpointId, applicationId },
			data: { secretVersion: { increment: 1 }, updatedAt: new Date() },
		});
		return result.count > 0 ? this.findEndpoint(applicationId, endpointId) : null;
	}

	async deleteEndpoint(applicationId: string, endpointId: string): Promise<boolean> {
		return (await this.db.webhookEndpoint.deleteMany({ where: { id: endpointId, applicationId } })).count > 0;
	}

	findSubscribed(applicationId: string, eventType: string): Promise<Array<{ id: string }>> {
		return this.db.webhookEndpoint.findMany({
			where: { applicationId, enabled: true, events: { has: eventType } },
			select: { id: true },
		});
	}

	createDelivery(input: { endpointId: string; applicationId: string; eventType: string; payload: unknown }): Promise<WebhookDeliveryView> {
		return this.db.webhookDelivery.create({
			data: { ...input, payload: input.payload as Prisma.InputJsonValue },
			select: deliverySelect,
		});
	}

	async findDelivery(deliveryId: string): Promise<DeliveryWithEndpoint | null> {
		const row = await this.db.webhookDelivery.findUnique({
			where: { id: deliveryId },
			select: { ...deliverySelect, payload: true, endpoint: { select: { id: true, url: true, enabled: true, secretVersion: true } } },
		});
		return row;
	}

	findDeliveryForApplication(applicationId: string, endpointId: string, deliveryId: string): Promise<WebhookDeliveryView | null> {
		return this.db.webhookDelivery.findFirst({ where: { id: deliveryId, endpointId, applicationId }, select: deliverySelect });
	}

	async listDeliveries(applicationId: string, endpointId: string, query: { limit: number; cursor?: string }): Promise<Page<WebhookDeliveryView>> {
		const cursor = decodeCursor(query.cursor);
		const rows = await this.db.webhookDelivery.findMany({
			where: {
				applicationId,
				endpointId,
				...(cursor ? { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] } : {}),
			},
			select: deliverySelect,
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: query.limit + 1,
		});
		return toPage(rows, query.limit, (row) => ({ at: row.createdAt, id: row.id }));
	}

	async recordAttempt(
		deliveryId: string,
		result: { status: "PENDING" | "SUCCEEDED" | "FAILED"; responseStatus: number | null; lastError: string | null },
	): Promise<void> {
		await this.db.webhookDelivery.update({
			where: { id: deliveryId },
			data: {
				status: result.status,
				responseStatus: result.responseStatus,
				lastError: result.lastError,
				attempts: { increment: 1 },
				...(result.status === "SUCCEEDED" ? { deliveredAt: new Date() } : {}),
			},
		});
	}

	async resetDelivery(deliveryId: string): Promise<void> {
		await this.db.webhookDelivery.update({
			where: { id: deliveryId },
			data: { status: "PENDING", attempts: 0, responseStatus: null, lastError: null, deliveredAt: null },
		});
	}

	async recordEndpointSuccess(endpointId: string): Promise<void> {
		await this.db.webhookEndpoint.updateMany({ where: { id: endpointId, consecutiveFailures: { gt: 0 } }, data: { consecutiveFailures: 0 } });
	}

	async recordEndpointFailure(endpointId: string): Promise<number> {
		const row = await this.db.webhookEndpoint.update({
			where: { id: endpointId },
			data: { consecutiveFailures: { increment: 1 } },
			select: { consecutiveFailures: true },
		});
		return row.consecutiveFailures;
	}

	async disableEndpoint(endpointId: string, reason: string): Promise<void> {
		await this.db.webhookEndpoint.updateMany({ where: { id: endpointId }, data: { enabled: false, disabledReason: reason } });
	}
}
