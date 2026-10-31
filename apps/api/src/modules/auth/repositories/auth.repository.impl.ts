import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { PublicUser } from "../auth.types.js";
import type { AuthTokenType, IAuthRepository, RegisterInput } from "./auth.repository.interface.js";

const publicUserSelect = { id: true, email: true, displayName: true, emailVerifiedAt: true } as const;

export class AuthRepositoryImpl implements IAuthRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	findByEmail(email: string) {
		return this.deps.prisma.user.findUnique({ where: { email } });
	}

	findById(id: string) {
		return this.deps.prisma.user.findUnique({ where: { id } });
	}

	findToken(tokenHash: string) {
		return this.deps.prisma.authToken.findUnique({ where: { tokenHash } });
	}

	findLatestToken(userId: string, type: AuthTokenType) {
		return this.deps.prisma.authToken.findFirst({ where: { userId, type }, orderBy: { createdAt: "desc" } });
	}

	register(input: RegisterInput): Promise<PublicUser> {
		return this.deps.prisma.$transaction(async (tx) => {
			const user = await tx.user.create({
				data: { email: input.email, displayName: input.displayName, passwordHash: input.passwordHash },
				select: publicUserSelect,
			});
			await tx.authIdentity.create({
				data: { userId: user.id, provider: "EMAIL", providerSubject: input.email },
			});
			await tx.authToken.create({
				data: {
					userId: user.id,
					type: "EMAIL_VERIFICATION",
					tokenHash: input.tokenHash,
					expiresAt: input.tokenExpiresAt,
				},
			});
			return user;
		});
	}

	consumeVerification(tokenId: string, userId: string): Promise<boolean> {
		return this.deps.prisma.$transaction(async (tx) => {
			const now = new Date();
			const updated = await tx.authToken.updateMany({
				where: { id: tokenId, userId, type: "EMAIL_VERIFICATION", consumedAt: null, expiresAt: { gt: now } },
				data: { consumedAt: now },
			});
			if (!updated.count) return false;
			await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
			return true;
		});
	}

	async replaceToken(userId: string, type: AuthTokenType, tokenHash: string, expiresAt: Date): Promise<void> {
		await this.deps.prisma.$transaction(async (tx) => {
			await tx.authToken.updateMany({
				where: { userId, type, consumedAt: null },
				data: { consumedAt: new Date() },
			});
			await tx.authToken.create({ data: { userId, type, tokenHash, expiresAt } });
		});
	}

	resetPassword(tokenId: string, userId: string, passwordHash: string): Promise<boolean> {
		return this.deps.prisma.$transaction(async (tx) => {
			const now = new Date();
			const updated = await tx.authToken.updateMany({
				where: { id: tokenId, userId, type: "PASSWORD_RESET", consumedAt: null, expiresAt: { gt: now } },
				data: { consumedAt: now },
			});
			if (!updated.count) return false;
			await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: now } });
			await tx.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
			await tx.authToken.updateMany({
				where: { userId, type: "PASSWORD_RESET", consumedAt: null },
				data: { consumedAt: now },
			});
			await tx.authSession.updateMany({
				where: { userId, revokedAt: null },
				data: { revokedAt: now, revokedReason: "PASSWORD_RESET" },
			});
			return true;
		});
	}

	async changePassword(userId: string, passwordHash: string, keepSessionId: string): Promise<void> {
		await this.deps.prisma.$transaction(async (tx) => {
			const now = new Date();
			await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: now } });
			await tx.authToken.updateMany({
				where: { userId, type: "PASSWORD_RESET", consumedAt: null },
				data: { consumedAt: now },
			});
			await tx.authSession.updateMany({
				where: { userId, revokedAt: null, id: { not: keepSessionId } },
				data: { revokedAt: now, revokedReason: "PASSWORD_CHANGED" },
			});
		});
	}

	async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
		await this.deps.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
	}

	async markLoggedIn(userId: string): Promise<void> {
		await this.deps.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
	}

	async purgeExpired(before: Date): Promise<{ sessions: number; tokens: number }> {
		const [sessions, tokens] = await this.deps.prisma.$transaction([
			this.deps.prisma.authSession.deleteMany({ where: { expiresAt: { lt: before } } }),
			this.deps.prisma.authToken.deleteMany({
				where: { OR: [{ expiresAt: { lt: before } }, { consumedAt: { lt: before } }] },
			}),
		]);
		return { sessions: sessions.count, tokens: tokens.count };
	}
}
