import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../../../config/env.js";
import { AuthenticationError } from "../../../foundation/errors/app-error.js";

export class TokenService {
	generate(): string {
		return randomBytes(32).toString("base64url");
	}

	hash(token: string): string {
		return createHash("sha256").update(token).digest("hex");
	}

	async signAccess(userId: string, sessionId: string): Promise<string> {
		return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: "HS256" })
			.setSubject(userId).setIssuer("supportai-api").setAudience("supportai")
			.setIssuedAt().setExpirationTime("15m")
			.sign(new TextEncoder().encode(env.AUTH_JWT_SECRET));
	}

	async verifyAccess(header?: string): Promise<{ userId: string; sessionId: string }> {
		if (!header?.startsWith("Bearer ")) throw new AuthenticationError();
		try {
			const { payload } = await jwtVerify(header.slice(7), new TextEncoder().encode(env.AUTH_JWT_SECRET), {
				issuer: "supportai-api", audience: "supportai", algorithms: ["HS256"],
			});
			if (!payload.sub || typeof payload.sid !== "string") throw new AuthenticationError();
			return { userId: payload.sub, sessionId: payload.sid };
		} catch {
			throw new AuthenticationError();
		}
	}
}
