export interface RequestMeta {
	ip?: string;
	userAgent?: string;
}

export interface PublicUser {
	id: string;
	email: string;
	displayName: string | null;
	emailVerifiedAt: Date | null;
}

export interface AuthContext {
	user: PublicUser;
	sessionId: string;
}

export type SessionRevokeReason =
	| "LOGOUT"
	| "LOGOUT_ALL"
	| "ROTATED"
	| "REUSE_DETECTED"
	| "PASSWORD_CHANGED"
	| "PASSWORD_RESET"
	| "USER_DISABLED"
	| "SESSION_LIMIT"
	| "REVOKED_BY_USER";

export interface SessionTokens {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
	refreshExpiresAt: Date;
}

export type AuditContext = { ip: string | null; userAgent: string | null };

export function toPublicUser(user: PublicUser): PublicUser {
	return {
		id: user.id,
		email: user.email,
		displayName: user.displayName,
		emailVerifiedAt: user.emailVerifiedAt,
	};
}

export function auditContext(meta: RequestMeta): AuditContext {
	return {
		ip: meta.ip ?? null,
		userAgent: meta.userAgent ? meta.userAgent.slice(0, 200) : null,
	};
}
