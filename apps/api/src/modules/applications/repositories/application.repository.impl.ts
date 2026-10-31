import type { PrismaClient } from "../../../generated/prisma/client.js";
import type {
	ApplicationPatch,
	ApplicationView,
	IApplicationRepository,
	NewApplication,
} from "./application.repository.interface.js";

const applicationSelect = {
	id: true,
	organizationId: true,
	name: true,
	slug: true,
	description: true,
	allowedOrigins: true,
	createdAt: true,
	updatedAt: true,
} as const;

export class ApplicationRepositoryImpl implements IApplicationRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	create(input: NewApplication): Promise<ApplicationView> {
		return this.deps.prisma.application.create({
			data: {
				organizationId: input.organizationId,
				name: input.name,
				slug: input.slug,
				description: input.description,
				allowedOrigins: input.allowedOrigins,
			},
			select: applicationSelect,
		});
	}

	countActive(organizationId: string): Promise<number> {
		return this.deps.prisma.application.count({ where: { organizationId, archivedAt: null } });
	}

	listVisible(organizationId: string, userId: string, seesAll: boolean): Promise<ApplicationView[]> {
		return this.deps.prisma.application.findMany({
			where: {
				organizationId,
				archivedAt: null,
				...(seesAll ? {} : { members: { some: { userId, status: "ACTIVE" } } }),
			},
			select: applicationSelect,
			orderBy: { name: "asc" },
		});
	}

	findById(organizationId: string, applicationId: string): Promise<ApplicationView | null> {
		return this.deps.prisma.application.findFirst({
			where: { id: applicationId, organizationId, archivedAt: null },
			select: applicationSelect,
		});
	}

	async update(organizationId: string, applicationId: string, patch: ApplicationPatch): Promise<ApplicationView | null> {
		const result = await this.deps.prisma.application.updateMany({
			where: { id: applicationId, organizationId, archivedAt: null },
			data: { name: patch.name, description: patch.description, allowedOrigins: patch.allowedOrigins },
		});
		if (result.count === 0) return null;
		return this.findById(organizationId, applicationId);
	}

	archive(organizationId: string, applicationId: string): Promise<boolean> {
		return this.deps.prisma.$transaction(async (tx) => {
			const now = new Date();
			const result = await tx.application.updateMany({
				where: { id: applicationId, organizationId, archivedAt: null },
				data: { archivedAt: now },
			});
			if (result.count === 0) return false;
			await tx.apiKey.updateMany({ where: { applicationId, revokedAt: null }, data: { revokedAt: now } });
			return true;
		});
	}
}
