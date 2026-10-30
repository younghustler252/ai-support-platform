export interface SessionRecord {
	id: string;
	userId: string;
	revokedAt: Date | null;
	expiresAt: Date;
}
export interface SessionUser {
	id: string;
	email: string;
	displayName: string | null;
	emailVerifiedAt: Date | null;
}
export interface ISessionRepository {
	create(input: { userId: string; refreshTokenHash: string; expiresAt: Date; userAgent?: string }): Promise<SessionRecord>;
	findByTokenHash(hash: string): Promise<SessionRecord | null>;
	rotate(input: { previousId: string; nextId: string; userId: string; refreshTokenHash: string; expiresAt: Date; userAgent?: string }): Promise<boolean>;
	findActiveUser(sessionId: string, userId: string): Promise<SessionUser | null>;
	revokeByTokenHash(hash: string): Promise<void>;
	revokeAll(userId: string): Promise<void>;
}
