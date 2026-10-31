import { createHash, randomBytes } from "node:crypto";

import { tenancyConfig } from "../../../config/tenancy.js";

const KEY_PATTERN = new RegExp(`^${tenancyConfig.apiKey.prefix}_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}$`);

export interface GeneratedApiKey {
	key: string;
	prefix: string;
	hash: string;
}

export class ApiKeyService {
	generate(): GeneratedApiKey {
		const prefix = `${tenancyConfig.apiKey.prefix}_${randomBytes(6).toString("base64url")}`;
		const key = `${prefix}_${randomBytes(32).toString("base64url")}`;
		return { key, prefix, hash: this.hash(key) };
	}

	hash(key: string): string {
		return createHash("sha256").update(key).digest("hex");
	}

	isWellFormed(key: string): boolean {
		return KEY_PATTERN.test(key);
	}

	extract(input: { authorization?: string; apiKeyHeader?: string }): string | null {
		const bearer = input.authorization ? /^Bearer\s+(\S+)$/i.exec(input.authorization)?.[1] : undefined;
		const candidate = bearer?.startsWith(`${tenancyConfig.apiKey.prefix}_`) ? bearer : input.apiKeyHeader?.trim();
		return candidate && this.isWellFormed(candidate) ? candidate : null;
	}
}
