import type { PrismaClient } from "../../../generated/prisma/client.js";

export const publicUserSelect = { id: true, email: true, displayName: true, emailVerifiedAt: true } as const;

export class AuthRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	get db(): PrismaClient { return this.deps.prisma; }

	findByEmail(email: string) {
		return this.db.user.findUnique({ where: { email } });
	}

	findToken(tokenHash: string) {
		return this.db.authToken.findUnique({ where: { tokenHash } });
	}

	findSession(refreshTokenHash: string) {
		return this.db.authSession.findUnique({ where: { refreshTokenHash } });
	}
}
