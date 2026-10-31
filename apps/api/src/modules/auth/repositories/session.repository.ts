import type { PublicUser, SessionRevokeReason } from "../auth.types.js";

export interface SessionRecord {
	id: string;
	userId: string;
	familyId: string;
	expiresAt: Date;
	absoluteExpiresAt: Date;
	revokedAt: Date | null;
	revokedReason: SessionRevokeReason | null;
}

export interface SessionLookup extends SessionRecord {
	userDisabledAt: Date | null;
}

export interface ActiveSessionSummary {
	id: string;
	userAgent: string | null;
	ipAddress: string | null;
	createdAt: Date;
	lastUsedAt: Date | null;
	expiresAt: Date;
	absoluteExpiresAt: Date;
}

export interface NewSession {
	userId: string;
	familyId: string;
	refreshTokenHash: string;
	expiresAt: Date;
	absoluteExpiresAt: Date;
	userAgent?: string;
	ipAddress?: string;
}

export interface ISessionRepository {
	create(input: NewSession & { maxActive: number }): Promise<SessionRecord>;
	findByTokenHash(hash: string): Promise<SessionLookup | null>;
	rotate(input: NewSession & { previousId: string; nextId: string }): Promise<boolean>;
	findActiveUser(sessionId: string, userId: string): Promise<PublicUser | null>;
	listActive(userId: string): Promise<ActiveSessionSummary[]>;
	revokeByTokenHash(hash: string, reason: SessionRevokeReason): Promise<void>;
	revokeFamily(familyId: string, reason: SessionRevokeReason): Promise<void>;
	revokeOwned(userId: string, sessionId: string, reason: SessionRevokeReason): Promise<boolean>;
	revokeAll(userId: string, reason: SessionRevokeReason, exceptSessionId?: string): Promise<void>;
}
