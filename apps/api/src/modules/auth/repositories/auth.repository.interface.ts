export interface AuthUserRecord {
	id: string;
	email: string;
	displayName: string | null;
	emailVerifiedAt: Date | null;
	passwordHash: string | null;
}
export interface AuthTokenRecord {
	id: string;
	userId: string;
	type: "EMAIL_VERIFICATION" | "PASSWORD_RESET";
	consumedAt: Date | null;
	expiresAt: Date;
}
export interface IAuthRepository {
	findByEmail(email: string): Promise<AuthUserRecord | null>;
	findToken(tokenHash: string): Promise<AuthTokenRecord | null>;
	register(input: { email: string; displayName?: string; passwordHash: string; tokenHash: string }): Promise<{
		id: string; email: string; displayName: string | null; emailVerifiedAt: Date | null;
	}>;
	consumeVerification(tokenId: string, userId: string): Promise<boolean>;
	replaceToken(userId: string, type: "EMAIL_VERIFICATION" | "PASSWORD_RESET", tokenHash: string, expiresAt: Date): Promise<void>;
	resetPassword(tokenId: string, userId: string, passwordHash: string): Promise<boolean>;
}
