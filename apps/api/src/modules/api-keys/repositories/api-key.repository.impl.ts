import type { PrismaClient } from "../../../generated/prisma/client.js";
import type {
	ApiKeyAuthRecord,
	ApiKeyView,
	IApiKeyRepository,
	NewApiKey,
} from "./api-key.repository.interface.js";

const apiKeySelect = {
	id: true,
	name: true,
	prefix: true,
	scopes: true,
	expiresAt: true,
	lastUsedAt: true,
	revokedAt: true,
	createdAt: true,
	createdByUserId: true,
} as const;

export class ApiKeyRepositoryImpl implements IApiKeyRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	create(input: NewApiKey): Promise<ApiKeyView> {
		return this.deps.prisma.apiKey.create({ data: input, select: apiKeySelect });
	}

	countActive(applicationId: string): Promise<number> {
		const now = new Date();
		return this.deps.prisma.apiKey.count({
			where: { applicationId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
		});
	}

	list(applicationId: string): Promise<ApiKeyView[]> {
		return this.deps.prisma.apiKey.findMany({
			where: { applicationId },
			select: apiKeySelect,
			orderBy: { createdAt: "desc" },
			take: 100,
		});
	}

	findOwned(applicationId: string, keyId: string): Promise<ApiKeyView | null> {
		return this.deps.prisma.apiKey.findFirst({ where: { id: keyId, applicationId }, select: apiKeySelect });
	}

	async revoke(applicationId: string, keyId: string): Promise<boolean> {
		const result = await this.deps.prisma.apiKey.updateMany({
			where: { id: keyId, applicationId, revokedAt: null },
			data: { revokedAt: new Date() },
		});
		return result.count > 0;
	}

	rotate(input: { applicationId: string; keyId: string; next: NewApiKey; graceUntil: Date | null }): Promise<ApiKeyView | null> {
		return this.deps.prisma.$transaction(async (tx) => {
			const previous = await tx.apiKey.findFirst({
				where: { id: input.keyId, applicationId: input.applicationId, revokedAt: null },
				select: { id: true, expiresAt: true },
			});
			if (!previous) return null;

			const created = await tx.apiKey.create({ data: input.next, select: apiKeySelect });

			const now = new Date();
			if (!input.graceUntil || input.graceUntil <= now) {
				await tx.apiKey.update({ where: { id: previous.id }, data: { revokedAt: now } });
			} else {
				const expiresAt = previous.expiresAt && previous.expiresAt < input.graceUntil ? previous.expiresAt : input.graceUntil;
				await tx.apiKey.update({ where: { id: previous.id }, data: { expiresAt } });
			}
			return created;
		});
	}

	async findAuthRecord(keyHash: string): Promise<ApiKeyAuthRecord | null> {
		const row = await this.deps.prisma.apiKey.findUnique({
			where: { keyHash },
			select: {
				id: true,
				prefix: true,
				scopes: true,
				expiresAt: true,
				revokedAt: true,
				lastUsedAt: true,
				application: {
					select: {
						id: true,
						name: true,
						slug: true,
						allowedOrigins: true,
						archivedAt: true,
						organizationId: true,
						organization: { select: { archivedAt: true } },
					},
				},
			},
		});
		if (!row) return null;
		const { organizationId, organization, ...application } = row.application;
		return {
			id: row.id,
			prefix: row.prefix,
			scopes: row.scopes,
			expiresAt: row.expiresAt,
			revokedAt: row.revokedAt,
			lastUsedAt: row.lastUsedAt,
			organizationId,
			organizationArchivedAt: organization.archivedAt,
			application,
		};
	}

	async touchLastUsed(keyId: string, staleBefore: Date): Promise<void> {
		await this.deps.prisma.apiKey.updateMany({
			where: { id: keyId, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: staleBefore } }] },
			data: { lastUsedAt: new Date() },
		});
	}
}
