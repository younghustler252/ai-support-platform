import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { IAuthRepository } from "./auth.repository.interface.js";

const publicUserSelect = { id: true, email: true, displayName: true, emailVerifiedAt: true } as const;

export class AuthRepositoryImpl implements IAuthRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	findByEmail(email: string) {
		return this.deps.prisma.user.findUnique({ where: { email } });
	}
	findToken(tokenHash: string) {
		return this.deps.prisma.authToken.findUnique({ where: { tokenHash } });
	}
	register(input: { email: string; displayName?: string; passwordHash: string; tokenHash: string }) {
		return this.deps.prisma.$transaction(async (tx) => {
			const user = await tx.user.create({
				data: { email: input.email, displayName: input.displayName, passwordHash: input.passwordHash },
				select: publicUserSelect,
			});
			await tx.authIdentity.create({ data: {
				userId: user.id, provider: "EMAIL", providerSubject: input.email,
			} });
			await tx.authToken.create({ data: {
				userId: user.id, type: "EMAIL_VERIFICATION", tokenHash: input.tokenHash,
				expiresAt: new Date(Date.now() + 86400000),
			} });
			return user;
		});
	}
	async consumeVerification(tokenId: string, userId: string) {
		return this.deps.prisma.$transaction(async (tx) => {
			const updated = await tx.authToken.updateMany({
				where: { id: tokenId, userId, type: "EMAIL_VERIFICATION", consumedAt: null, expiresAt: { gt: new Date() } },
				data: { consumedAt: new Date() },
			});
			if (!updated.count) return false;
			await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
			return true;
		});
	}
	async replaceToken(userId: string, type: "EMAIL_VERIFICATION" | "PASSWORD_RESET", tokenHash: string, expiresAt: Date) {
		await this.deps.prisma.$transaction(async (tx) => {
			await tx.authToken.updateMany({ where: { userId, type, consumedAt: null }, data: { consumedAt: new Date() } });
			await tx.authToken.create({ data: { userId, type, tokenHash, expiresAt } });
		});
	}
	async resetPassword(tokenId: string, userId: string, passwordHash: string) {
		return this.deps.prisma.$transaction(async (tx) => {
			const updated = await tx.authToken.updateMany({
				where: { id: tokenId, userId, type: "PASSWORD_RESET", consumedAt: null, expiresAt: { gt: new Date() } },
				data: { consumedAt: new Date() },
			});
			if (!updated.count) return false;
			await tx.user.update({ where: { id: userId }, data: { passwordHash, authVersion: { increment: 1 } } });
			await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
			return true;
		});
	}
}
