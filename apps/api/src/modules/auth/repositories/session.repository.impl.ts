import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { ISessionRepository } from "./session.repository.js";

export class SessionRepositoryImpl implements ISessionRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	create(input: { userId: string; refreshTokenHash: string; expiresAt: Date; userAgent?: string }) {
		return this.deps.prisma.authSession.create({ data: input });
	}
	findByTokenHash(hash: string) {
		return this.deps.prisma.authSession.findUnique({ where: { refreshTokenHash: hash } });
	}
	async rotate(input: { previousId: string; nextId: string; userId: string; refreshTokenHash: string; expiresAt: Date; userAgent?: string }) {
		return this.deps.prisma.$transaction(async (tx) => {
			const updated = await tx.authSession.updateMany({
				where: { id: input.previousId, userId: input.userId, revokedAt: null, expiresAt: { gt: new Date() } },
				data: { revokedAt: new Date(), lastUsedAt: new Date() },
			});
			if (updated.count !== 1) return false;
			await tx.authSession.create({ data: {
				id: input.nextId, userId: input.userId, refreshTokenHash: input.refreshTokenHash,
				expiresAt: input.expiresAt, userAgent: input.userAgent,
			} });
			return true;
		});
	}
	async findActiveUser(sessionId: string, userId: string) {
		const session = await this.deps.prisma.authSession.findFirst({
			where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
			include: { user: { select: { id: true, email: true, displayName: true, emailVerifiedAt: true } } },
		});
		return session?.user ?? null;
	}
	async revokeByTokenHash(hash: string) {
		await this.deps.prisma.authSession.updateMany({
			where: { refreshTokenHash: hash, revokedAt: null }, data: { revokedAt: new Date() },
		});
	}
	async revokeAll(userId: string) {
		await this.deps.prisma.authSession.updateMany({
			where: { userId, revokedAt: null }, data: { revokedAt: new Date() },
		});
	}
}
