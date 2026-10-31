import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { authConfig } from "../../../config/auth.js";
import { AuthenticationError } from "../../../foundation/errors/app-error.js";

interface SigningKey {
	id: string;
	secret: Uint8Array;
}

function signingKey(secret: string): SigningKey {
	return {
		id: createHash("sha256").update(secret).digest("hex").slice(0, 12),
		secret: new TextEncoder().encode(secret),
	};
}

const currentKey = signingKey(authConfig.jwt.secret);
const verificationKeys = new Map<string, Uint8Array>([[currentKey.id, currentKey.secret]]);
if (authConfig.jwt.previousSecret) {
	const previousKey = signingKey(authConfig.jwt.previousSecret);
	verificationKeys.set(previousKey.id, previousKey.secret);
}

export class TokenService {
	generate(): string {
		return randomBytes(32).toString("base64url");
	}

	hash(token: string): string {
		return createHash("sha256").update(token).digest("hex");
	}

	async signAccess(userId: string, sessionId: string): Promise<string> {
		const issuedAt = Math.floor(Date.now() / 1000);
		return new SignJWT({ sid: sessionId })
			.setProtectedHeader({ alg: "HS256", kid: currentKey.id })
			.setSubject(userId)
			.setIssuer(authConfig.jwt.issuer)
			.setAudience(authConfig.jwt.audience)
			.setIssuedAt(issuedAt)
			.setExpirationTime(issuedAt + authConfig.accessTtlSeconds)
			.sign(currentKey.secret);
	}

	async verifyAccess(header?: string): Promise<{ userId: string; sessionId: string }> {
		const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
		if (!match) throw new AuthenticationError();
		try {
			const { payload } = await jwtVerify(
				match[1] as string,
				async (protectedHeader) => {
					const secret = typeof protectedHeader.kid === "string" ? verificationKeys.get(protectedHeader.kid) : undefined;
					if (!secret) throw new Error("Unknown signing key");
					return secret;
				},
				{ issuer: authConfig.jwt.issuer, audience: authConfig.jwt.audience, algorithms: ["HS256"] },
			);
			if (!payload.sub || typeof payload.sid !== "string") throw new Error("Malformed access token");
			return { userId: payload.sub, sessionId: payload.sid };
		} catch {
			throw new AuthenticationError();
		}
	}
}
