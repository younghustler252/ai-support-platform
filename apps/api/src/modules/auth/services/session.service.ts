import { randomUUID } from "node:crypto";
import { AuthenticationError } from "../../../foundation/errors/app-error.js";
import type { ISessionRepository } from "../repositories/session.repository.js";
import type { TokenService } from "./token.service.js";

const SESSION_MS = 7 * 86400000;

export class SessionService {
	constructor(private readonly deps: { sessionRepository: ISessionRepository; tokenService: TokenService }) {}

	async create(userId: string, userAgent?: string) {
		const refreshToken = this.deps.tokenService.generate();
		const session = await this.deps.sessionRepository.create({
			userId, refreshTokenHash: this.deps.tokenService.hash(refreshToken),
			expiresAt: new Date(Date.now() + SESSION_MS),
			userAgent: userAgent?.slice(0, 512),
		});
		return {
			accessToken: await this.deps.tokenService.signAccess(userId, session.id),
			refreshToken, expiresIn: 900,
		};
	}

	async rotate(token: string, userAgent?: string) {
		const existing = await this.deps.sessionRepository.findByTokenHash(this.deps.tokenService.hash(token));
		if (!existing) throw new AuthenticationError("Invalid refresh token");
		if (existing.revokedAt) {
			await this.revokeAll(existing.userId);
			throw new AuthenticationError("Refresh token reuse detected");
		}
		if (existing.expiresAt <= new Date()) throw new AuthenticationError("Refresh token expired");

		const next = this.deps.tokenService.generate();
		const nextSessionId = randomUUID();
		const rotated = await this.deps.sessionRepository.rotate({
			previousId: existing.id, nextId: nextSessionId, userId: existing.userId,
			refreshTokenHash: this.deps.tokenService.hash(next),
			expiresAt: new Date(Date.now() + SESSION_MS),
			userAgent: userAgent?.slice(0, 512),
		});
		if (!rotated) {
			await this.revokeAll(existing.userId);
			throw new AuthenticationError("Refresh token already used");
		}
		return {
			accessToken: await this.deps.tokenService.signAccess(existing.userId, nextSessionId),
			refreshToken: next, expiresIn: 900,
		};
	}

	async authenticate(header?: string) {
		const { userId, sessionId } = await this.deps.tokenService.verifyAccess(header);
		const user = await this.deps.sessionRepository.findActiveUser(sessionId, userId);
		if (!user?.emailVerifiedAt) throw new AuthenticationError();
		return { user, sessionId };
	}

	async revoke(token: string) {
		await this.deps.sessionRepository.revokeByTokenHash(this.deps.tokenService.hash(token));
		return { loggedOut: true };
	}

	async revokeAll(userId: string) {
		await this.deps.sessionRepository.revokeAll(userId);
		return { loggedOut: true };
	}
}
