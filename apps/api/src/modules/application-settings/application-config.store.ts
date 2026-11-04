import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

export interface IApplicationConfigStore {
	read(applicationId: string): Promise<Record<string, unknown>>;
	update<T>(applicationId: string, section: string, mutate: (current: unknown) => T): Promise<T>;
}

export class ApplicationConfigStore implements IApplicationConfigStore {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	async read(applicationId: string): Promise<Record<string, unknown>> {
		const row = await this.deps.prisma.applicationSetting.findUnique({ where: { applicationId }, select: { config: true } });
		return (row?.config as Record<string, unknown> | null) ?? {};
	}

	update<T>(applicationId: string, section: string, mutate: (current: unknown) => T): Promise<T> {
		return this.deps.prisma.$transaction(async (tx) => {
			await tx.applicationSetting.upsert({ where: { applicationId }, create: { applicationId, config: {} }, update: {} });
			await tx.$queryRaw`SELECT "applicationId" FROM "ApplicationSetting" WHERE "applicationId" = ${applicationId} FOR UPDATE`;
			const row = await tx.applicationSetting.findUniqueOrThrow({ where: { applicationId }, select: { config: true } });
			const existing = (row.config as Record<string, unknown> | null) ?? {};
			const next = mutate(existing[section]);
			await tx.applicationSetting.update({
				where: { applicationId },
				data: { config: { ...existing, [section]: next } as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
			});
			return next;
		});
	}
}
