import type { PrismaClient } from "../../generated/prisma/client.js";

/**
 * Shared dependency contract for repositories.
 * Concrete repositories own their queries and tenant filters.
 * Do not put unscoped findAll/deleteAll helpers here.
 */
export interface RepositoryDependencies {
	prisma: PrismaClient;
}

export abstract class BaseRepository {
	protected readonly prisma: PrismaClient;

	constructor(deps: RepositoryDependencies) {
		this.prisma = deps.prisma;
	}
}
