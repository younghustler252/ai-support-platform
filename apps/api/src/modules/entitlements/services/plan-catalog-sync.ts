import type { PrismaClient } from "../../../generated/prisma/client.js";
import { featureCatalog, planCatalog } from "../entitlement-catalog.js";

const ADVISORY_LOCK_KEY = 727_002;

export async function syncPlanCatalog(prisma: PrismaClient): Promise<void> {
	await prisma.$transaction(
		async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`;

			for (const feature of featureCatalog) {
				await tx.feature.upsert({
					where: { code: feature.code },
					create: { code: feature.code, description: feature.description },
					update: { description: feature.description },
				});
			}
			const features = await tx.feature.findMany({ select: { id: true, code: true } });
			const featureId = new Map(features.map((feature) => [feature.code, feature.id]));

			for (const definition of planCatalog) {
				const plan = await tx.plan.upsert({
					where: { code: definition.code },
					create: { code: definition.code, name: definition.name },
					update: { name: definition.name },
				});
				for (const [code, value] of Object.entries(definition.entitlements)) {
					const id = featureId.get(code);
					if (!id) continue;
					await tx.planEntitlement.upsert({
						where: { planId_featureId: { planId: plan.id, featureId: id } },
						create: { planId: plan.id, featureId: id, enabled: value.enabled, limit: value.limit },
						update: { enabled: value.enabled, limit: value.limit },
					});
				}
			}
		},
		{ timeout: 20_000 },
	);
}
