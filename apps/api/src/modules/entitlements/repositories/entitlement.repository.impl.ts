import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { StoredPlan } from "../entitlement.types.js";
import type { IEntitlementRepository } from "./entitlement.repository.interface.js";

export class EntitlementRepositoryImpl implements IEntitlementRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	async findOrganizationPlan(organizationId: string): Promise<StoredPlan | null> {
		const row = await this.deps.prisma.organization.findUnique({
			where: { id: organizationId },
			select: {
				plan: {
					select: {
						code: true,
						name: true,
						entitlements: { select: { enabled: true, limit: true, feature: { select: { code: true } } } },
					},
				},
			},
		});
		if (!row?.plan) return null;
		return {
			code: row.plan.code,
			name: row.plan.name,
			entitlements: row.plan.entitlements.map((item) => ({ feature: item.feature.code, enabled: item.enabled, limit: item.limit })),
		};
	}

	async organizationOfApplication(applicationId: string): Promise<string | null> {
		const row = await this.deps.prisma.application.findUnique({ where: { id: applicationId }, select: { organizationId: true } });
		return row?.organizationId ?? null;
	}

	countApplications(organizationId: string): Promise<number> {
		return this.deps.prisma.application.count({ where: { organizationId, archivedAt: null } });
	}

	countAiRequestsSince(organizationId: string, since: Date): Promise<number> {
		return this.deps.prisma.usageEvent.count({
			where: { metric: "ai.request", createdAt: { gte: since }, application: { organizationId } },
		});
	}
}
