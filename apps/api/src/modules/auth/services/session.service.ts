import { randomUUID } from "node:crypto";
import { authConfig } from "../../../config/auth.js";
import { AuthenticationError, RefreshConflictError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import {
	auditContext,
	type AuthContext,
	type RequestMeta,
	type SessionRevokeReason,
	type SessionTokens,
} from "../auth.types.js";
import { truncate } from "../auth.utils.js";
import type { ActiveSessionSummary, ISessionRepository } from "../repositories/session.repository.js";
import type { TokenService } from "./token.service.js";

interface Dependencies {
	sessionRepository: ISessionRepository;
	tokenService: TokenService;
	auditService: AuditRecorder;
}

export class SessionService {
	constructor(private readonly deps: Dependencies) {}

	async create(userId: string, meta: RequestMeta = {}): Promise<SessionTokens> {
		const now = Date.now();
		const refreshToken = this.deps.tokenService.generate();
		const absoluteExpiresAt = new Date(now + authConfig.sessionMaxMs);
		const expiresAt = new Date(Math.min(now + authConfig.refreshTtlMs, absoluteExpiresAt.getTime()));

		const session = await this.deps.sessionRepository.create({
			userId,
			familyId: randomUUID(),
			refreshTokenHash: this.deps.tokenService.hash(refreshToken),
			expiresAt,
			absoluteExpiresAt,
			userAgent: truncate(meta.userAgent, 512),
			ipAddress: truncate(meta.ip, 64),
			maxActive: authConfig.maxActiveSessions,
		});
		return this.issue(userId, session.id, refreshToken, expiresAt);
	}

	async rotate(token: string, meta: RequestMeta = {}): Promise<SessionTokens> {
		const { sessionRepository, tokenService } = this.deps;
		const existing = await sessionRepository.findByTokenHash(tokenService.hash(token));
		if (!existing) throw new AuthenticationError("Invalid refresh token");

		const now = Date.now();
		if (existing.revokedAt) {
			if (existing.revokedReason !== "ROTATED") throw new AuthenticationError("Invalid refresh token");
			if (now - existing.revokedAt.getTime() < authConfig.refreshGraceMs) throw new RefreshConflictError();
			await sessionRepository.revokeFamily(existing.familyId, "REUSE_DETECTED");
			await this.deps.auditService.record({
				actorUserId: existing.userId,
				action: "auth.session.reuse_detected",
				resourceType: "AuthSession",
				resourceId: existing.familyId,
				metadata: auditContext(meta),
			});
			throw new AuthenticationError("Invalid refresh token");
		}

		if (existing.userDisabledAt) {
			await sessionRepository.revokeFamily(existing.familyId, "USER_DISABLED");
			throw new AuthenticationError("Invalid refresh token");
		}
		if (existing.expiresAt.getTime() <= now || existing.absoluteExpiresAt.getTime() <= now) {
			throw new AuthenticationError("Refresh token expired");
		}

		const nextToken = tokenService.generate();
		const nextId = randomUUID();
		const expiresAt = new Date(Math.min(now + authConfig.refreshTtlMs, existing.absoluteExpiresAt.getTime()));
		const rotated = await sessionRepository.rotate({
			previousId: existing.id,
			nextId,
			userId: existing.userId,
			familyId: existing.familyId,
			refreshTokenHash: tokenService.hash(nextToken),
			expiresAt,
			absoluteExpiresAt: existing.absoluteExpiresAt,
			userAgent: truncate(meta.userAgent, 512),
			ipAddress: truncate(meta.ip, 64),
		});
		if (!rotated) throw new RefreshConflictError();

		return this.issue(existing.userId, nextId, nextToken, expiresAt);
	}

	async authenticate(header?: string): Promise<AuthContext> {
		const { userId, sessionId } = await this.deps.tokenService.verifyAccess(header);
		const user = await this.deps.sessionRepository.findActiveUser(sessionId, userId);
		if (!user?.emailVerifiedAt) throw new AuthenticationError();
		return { user, sessionId };
	}

	async revoke(token: string, meta: RequestMeta = {}): Promise<void> {
		const hash = this.deps.tokenService.hash(token);
		const session = await this.deps.sessionRepository.findByTokenHash(hash);
		if (!session || session.revokedAt) return;
		await this.deps.sessionRepository.revokeByTokenHash(hash, "LOGOUT");
		await this.deps.auditService.record({
			actorUserId: session.userId,
			action: "auth.logout",
			resourceType: "AuthSession",
			resourceId: session.id,
			metadata: auditContext(meta),
		});
	}

	revokeAll(userId: string, reason: SessionRevokeReason, exceptSessionId?: string): Promise<void> {
		return this.deps.sessionRepository.revokeAll(userId, reason, exceptSessionId);
	}

	listActive(userId: string): Promise<ActiveSessionSummary[]> {
		return this.deps.sessionRepository.listActive(userId);
	}

	revokeOwned(userId: string, sessionId: string): Promise<boolean> {
		return this.deps.sessionRepository.revokeOwned(userId, sessionId, "REVOKED_BY_USER");
	}

	private async issue(userId: string, sessionId: string, refreshToken: string, refreshExpiresAt: Date): Promise<SessionTokens> {
		return {
			accessToken: await this.deps.tokenService.signAccess(userId, sessionId),
			refreshToken,
			expiresIn: authConfig.accessTtlSeconds,
			refreshExpiresAt,
		};
	}
}
