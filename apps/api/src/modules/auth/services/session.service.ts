import { randomUUID } from "node:crypto";
import { AuthenticationError } from "../../../foundation/errors/app-error.js";
import type { AuthRepository } from "../repositories/auth.repository.js";
import type { TokenService } from "./token.service.js";

const SESSION_MS = 7 * 86400000;

export class SessionService {
	constructor(private readonly deps: { authRepository: AuthRepository; tokenService: TokenService }) {}

	async create(userId: string, userAgent?: string) {
		const refreshToken = this.deps.tokenService.generate();
		const session = await this.deps.authRepository.db.authSession.create({
			data: {
				userId, refreshTokenHash: this.deps.tokenService.hash(refreshToken),
				expiresAt: new Date(Date.now() + SESSION_MS),
				userAgent: userAgent?.slice(0, 512),
			},
		});
		return {
			accessToken: await this.deps.tokenService.signAccess(userId, session.id),
			refreshToken, expiresIn: 900,
		};
	}

	async rotate(token: string, userAgent?: string) {
		const existing = await this.deps.authRepository.findSession(this.deps.tokenService.hash(token));
		if (!existing) throw new AuthenticationError("Invalid refresh token");
		if (existing.revokedAt) {
			await this.revokeAll(existing.userId);
			throw new AuthenticationError("Refresh token reuse detected");
		}
		if (existing.expiresAt <= new Date()) throw new AuthenticationError("Refresh token expired");

		const next = this.deps.tokenService.generate();
		const nextSessionId = randomUUID();
		try {
			await this.deps.authRepository.db.$transaction(async (tx) => {
				const changed = await tx.authSession.updateMany({
					where: { id: existing.id, revokedAt: null, expiresAt: { gt: new Date() } },
					data: { revokedAt: new Date(), lastUsedAt: new Date() },
				});
				if (!changed.count) throw new AuthenticationError("Refresh token already used");
				await tx.authSession.create({ data: {
					id: nextSessionId, userId: existing.userId,
					refreshTokenHash: this.deps.tokenService.hash(next),
					expiresAt: new Date(Date.now() + SESSION_MS),
					userAgent: userAgent?.slice(0, 512),
				} });
			});
		} catch (error) {
			if (error instanceof AuthenticationError) await this.revokeAll(existing.userId);
			throw error;
		}
		return {
			accessToken: await this.deps.tokenService.signAccess(existing.userId, nextSessionId),
			refreshToken: next, expiresIn: 900,
		};
	}

	async authenticate(header?: string) {
		const { userId, sessionId } = await this.deps.tokenService.verifyAccess(header);
		const session = await this.deps.authRepository.db.authSession.findFirst({
			where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
			include: { user: { select: {
				id: true, email: true, displayName: true, emailVerifiedAt: true,
			} } },
		});
		if (!session?.user.emailVerifiedAt) throw new AuthenticationError();
		return { user: session.user, sessionId };
	}

	async revoke(token: string) {
		await this.deps.authRepository.db.authSession.updateMany({
			where: { refreshTokenHash: this.deps.tokenService.hash(token), revokedAt: null },
			data: { revokedAt: new Date() },
		});
		return { loggedOut: true };
	}

	async revokeAll(userId: string) {
		await this.deps.authRepository.db.authSession.updateMany({
			where: { userId, revokedAt: null }, data: { revokedAt: new Date() },
		});
		return { loggedOut: true };
	}
}
