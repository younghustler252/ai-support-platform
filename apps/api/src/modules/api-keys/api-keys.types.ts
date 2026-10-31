import type { ApiKeyScope } from "../../config/tenancy.js";

export interface ApiKeyPrincipal {
	keyId: string;
	keyPrefix: string;
	scopes: readonly string[];
	organizationId: string;
	application: {
		id: string;
		name: string;
		slug: string;
		allowedOrigins: string[];
	};
}

export type { ApiKeyScope };
