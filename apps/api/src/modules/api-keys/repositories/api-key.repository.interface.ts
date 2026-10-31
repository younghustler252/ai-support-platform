export interface ApiKeyView {
	id: string;
	name: string;
	prefix: string;
	scopes: string[];
	expiresAt: Date | null;
	lastUsedAt: Date | null;
	revokedAt: Date | null;
	createdAt: Date;
	createdByUserId: string | null;
}

export interface NewApiKey {
	applicationId: string;
	name: string;
	prefix: string;
	keyHash: string;
	scopes: string[];
	createdByUserId: string;
	expiresAt: Date | null;
}

export interface ApiKeyAuthRecord {
	id: string;
	prefix: string;
	scopes: string[];
	expiresAt: Date | null;
	revokedAt: Date | null;
	lastUsedAt: Date | null;
	organizationId: string;
	organizationArchivedAt: Date | null;
	application: {
		id: string;
		name: string;
		slug: string;
		allowedOrigins: string[];
		archivedAt: Date | null;
	};
}

export interface IApiKeyRepository {
	create(input: NewApiKey): Promise<ApiKeyView>;
	countActive(applicationId: string): Promise<number>;
	list(applicationId: string): Promise<ApiKeyView[]>;
	findOwned(applicationId: string, keyId: string): Promise<ApiKeyView | null>;
	revoke(applicationId: string, keyId: string): Promise<boolean>;
	rotate(input: { applicationId: string; keyId: string; next: NewApiKey; graceUntil: Date | null }): Promise<ApiKeyView | null>;
	findAuthRecord(keyHash: string): Promise<ApiKeyAuthRecord | null>;
	touchLastUsed(keyId: string, staleBefore: Date): Promise<void>;
}
