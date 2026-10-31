import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { SessionRevokeReason } from "../auth.types.js";
import type {
	ActiveSessionSummary,
	ISessionRepository,
	NewSession,
	SessionLookup,
	SessionRecord,
} from "./session.repository.js";

const publicUserSelect = { id: true, email: true, displayName: true, emailVerifiedAt: true } as const;

function toRecord(row: SessionRecord): SessionRecord {
	return {
		id: row.id,
		userId: row.userId,
		familyId: row.familyId,
		expiresAt: row.expiresAt,
		absoluteExpiresAt: row.absoluteExpiresAt,
		revokedAt: row.revokedAt,
		revokedReason: row.revokedReason,
	};
}

export class SessionRepositoryImpl implements ISessionRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	create(input: NewSession & { maxActive: number }): Promise<SessionRecord> {
		return this.deps.prisma.$transaction(async (tx) => {
			const now = new Date();
			const created = await tx.authSession.create({
				data: {
					userId: input.userId,
					familyId: input.familyId,
					refreshTokenHash: input.refreshTokenHash,
					expiresAt: input.expiresAt,
					absoluteExpiresAt: input.absoluteExpiresAt,
					userAgent: input.userAgent,
					ipAddress: input.ipAddress,
					lastUsedAt: now,
				},
			});
			const surplus = await tx.authSession.findMany({
				where: { userId: input.userId, revokedAt: null, expiresAt: { gt: now } },
				orderBy: { createdAt: "desc" },
				skip: input.maxActive,
				select: { id: true },
			});
			if (surplus.length > 0) {
				await tx.authSession.updateMany({
					where: { id: { in: surplus.map((session) => session.id) } },
					data: { revokedAt: now, revokedReason: "SESSION_LIMIT" },
				});
			}
			return toRecord(created);
		});
	}

	async findByTokenHash(hash: string): Promise<SessionLookup | null> {
		const row = await this.deps.prisma.authSession.findUnique({
			where: { refreshTokenHash: hash },
			include: { user: { select: { disabledAt: true } } },
		});
		if (!row) return null;
		return { ...toRecord(row), userDisabledAt: row.user.disabledAt };
	}

	rotate(input: NewSession & { previousId: string; nextId: string }): Promise<boolean> {
		return this.deps.prisma.$transaction(async (tx) => {
			const now = new Date();
			const updated = await tx.authSession.updateMany({
				where: { id: input.previousId, userId: input.userId, revokedAt: null, expiresAt: { gt: now } },
				data: { revokedAt: now, revokedReason: "ROTATED" },
			});
			if (updated.count !== 1) return false;
			await tx.authSession.create({
				data: {
					id: input.nextId,
					userId: input.userId,
					familyId: input.familyId,
					refreshTokenHash: input.refreshTokenHash,
					expiresAt: input.expiresAt,
					absoluteExpiresAt: input.absoluteExpiresAt,
					userAgent: input.userAgent,
					ipAddress: input.ipAddress,
					lastUsedAt: now,
				},
			});
			return true;
		});
	}

	async findActiveUser(sessionId: string, userId: string) {
		const session = await this.deps.prisma.authSession.findFirst({
			where: {
				id: sessionId,
				userId,
				revokedAt: null,
				expiresAt: { gt: new Date() },
				user: { disabledAt: null },
			},
			include: { user: { select: publicUserSelect } },
		});
		return session?.user ?? null;
	}

	async listActive(userId: string): Promise<ActiveSessionSummary[]> {
		const rows = await this.deps.prisma.authSession.findMany({
			where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				userAgent: true,
				ipAddress: true,
				createdAt: true,
				lastUsedAt: true,
				expiresAt: true,
				absoluteExpiresAt: true,
			},
		});
		return rows;
	}

	async revokeByTokenHash(hash: string, reason: SessionRevokeReason): Promise<void> {
		await this.deps.prisma.authSession.updateMany({
			where: { refreshTokenHash: hash, revokedAt: null },
			data: { revokedAt: new Date(), revokedReason: reason },
		});
	}

	async revokeFamily(familyId: string, reason: SessionRevokeReason): Promise<void> {
		await this.deps.prisma.authSession.updateMany({
			where: { familyId, revokedAt: null },
			data: { revokedAt: new Date(), revokedReason: reason },
		});
	}

	async revokeOwned(userId: string, sessionId: string, reason: SessionRevokeReason): Promise<boolean> {
		const result = await this.deps.prisma.authSession.updateMany({
			where: { id: sessionId, userId, revokedAt: null },
			data: { revokedAt: new Date(), revokedReason: reason },
		});
		return result.count > 0;
	}

	async revokeAll(userId: string, reason: SessionRevokeReason, exceptSessionId?: string): Promise<void> {
		await this.deps.prisma.authSession.updateMany({
			where: {
				userId,
				revokedAt: null,
				...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
			},
			data: { revokedAt: new Date(), revokedReason: reason },
		});
	}
}
