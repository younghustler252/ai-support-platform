import type { PublicUser } from "../auth.types.js";

export type AuthTokenType = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

export interface AuthUserRecord extends PublicUser {
	passwordHash: string | null;
	disabledAt: Date | null;
}

export interface AuthTokenRecord {
	id: string;
	userId: string;
	type: AuthTokenType;
	consumedAt: Date | null;
	expiresAt: Date;
	createdAt: Date;
}

export interface RegisterInput {
	email: string;
	displayName?: string;
	passwordHash: string;
	tokenHash: string;
	tokenExpiresAt: Date;
}

export interface IAuthRepository {
	findByEmail(email: string): Promise<AuthUserRecord | null>;
	findById(id: string): Promise<AuthUserRecord | null>;
	findToken(tokenHash: string): Promise<AuthTokenRecord | null>;
	findLatestToken(userId: string, type: AuthTokenType): Promise<AuthTokenRecord | null>;
	register(input: RegisterInput): Promise<PublicUser>;
	consumeVerification(tokenId: string, userId: string): Promise<boolean>;
	replaceToken(userId: string, type: AuthTokenType, tokenHash: string, expiresAt: Date): Promise<void>;
	resetPassword(tokenId: string, userId: string, passwordHash: string): Promise<boolean>;
	changePassword(userId: string, passwordHash: string, keepSessionId: string): Promise<void>;
	updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
	markLoggedIn(userId: string): Promise<void>;
	purgeExpired(before: Date): Promise<{ sessions: number; tokens: number }>;
}
