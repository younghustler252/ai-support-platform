import type { PrismaClient } from "../../../generated/prisma/client.js";
import { decodeCursor, toPage, type Page } from "../../../foundation/utils/cursor.js";
import type { CustomerMetadata, CustomerPatch, CustomerView, ICustomerRepository } from "./customer.repository.interface.js";

const customerSelect = {
	id: true,
	applicationId: true,
	externalId: true,
	displayName: true,
	email: true,
	metadata: true,
	createdAt: true,
	updatedAt: true,
} as const;

interface CustomerRow {
	id: string;
	applicationId: string;
	externalId: string | null;
	displayName: string | null;
	email: string | null;
	metadata: unknown;
	createdAt: Date;
	updatedAt: Date;
}

function toView(row: CustomerRow): CustomerView {
	return { ...row, metadata: (row.metadata as CustomerMetadata | null) ?? null };
}

function definedFields(patch: CustomerPatch) {
	return {
		...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
		...(patch.email !== undefined ? { email: patch.email } : {}),
		...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
	};
}

export class CustomerRepositoryImpl implements ICustomerRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	async list(
		applicationId: string,
		query: { search?: string; limit: number; cursor?: string },
	): Promise<Page<CustomerView>> {
		const cursor = decodeCursor(query.cursor);
		const search = query.search;
		const conditions = [
			...(search
				? [
						{
							OR: [
								{ displayName: { contains: search, mode: "insensitive" as const } },
								{ email: { contains: search, mode: "insensitive" as const } },
								{ externalId: { startsWith: search } },
							],
						},
					]
				: []),
			...(cursor ? [{ OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] }] : []),
		];
		const rows = await this.deps.prisma.customer.findMany({
			where: { applicationId, ...(conditions.length > 0 ? { AND: conditions } : {}) },
			select: customerSelect,
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: query.limit + 1,
		});
		return toPage(rows.map(toView), query.limit, (row) => ({ at: row.createdAt, id: row.id }));
	}

	async find(applicationId: string, customerId: string): Promise<CustomerView | null> {
		const row = await this.deps.prisma.customer.findFirst({ where: { id: customerId, applicationId }, select: customerSelect });
		return row ? toView(row) : null;
	}

	async update(applicationId: string, customerId: string, patch: CustomerPatch): Promise<CustomerView | null> {
		const result = await this.deps.prisma.customer.updateMany({
			where: { id: customerId, applicationId },
			data: definedFields(patch),
		});
		return result.count > 0 ? this.find(applicationId, customerId) : null;
	}

	async upsertByExternalId(applicationId: string, externalId: string, patch: CustomerPatch): Promise<CustomerView> {
		const row = await this.deps.prisma.customer.upsert({
			where: { applicationId_externalId: { applicationId, externalId } },
			create: { applicationId, externalId, ...definedFields(patch) },
			update: definedFields(patch),
			select: customerSelect,
		});
		return toView(row);
	}
}
