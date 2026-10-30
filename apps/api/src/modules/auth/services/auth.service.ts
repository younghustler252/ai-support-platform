import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { AuthenticationError, ConflictError, ValidationError } from "../../../foundation/errors/app-error.js";
import { env } from "../../../config/env.js";
import type { PasswordService } from "./password.service.js";
import type { RegisterInput } from "../validators/auth.validator.js";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const secret = () => new TextEncoder().encode(env.AUTH_JWT_SECRET);
const safeUser = { id: true, email: true, displayName: true, emailVerifiedAt: true } as const;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

interface Dependencies {
	prisma: PrismaClient;
	passwordService: PasswordService;
	authEmailService: AuthEmailService;
}

export class AuthEmailService {
	async send(email: string, purpose: "verify" | "reset", token: string): Promise<void> {
		const url = new URL(purpose === "verify" ? "/verify-email" : "/reset-password", env.AUTH_FRONTEND_URL);
		url.searchParams.set("token", token);
		if (!env.AUTH_EMAIL_API_KEY || !env.AUTH_EMAIL_FROM) {
			if (env.NODE_ENV !== "production") {
				// Development only: never expose tokens in API responses.
				console.info("[auth development email]", email, url.toString());
				return;
			}
			throw new Error("Authentication email provider is not configured");
		}
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${env.AUTH_EMAIL_API_KEY}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				from: env.AUTH_EMAIL_FROM,
				to: [email],
				subject: purpose === "verify" ? "Verify your SupportAI email" : "Reset your SupportAI password",
				html: `<p>Open this link to ${purpose === "verify" ? "verify your email" : "reset your password"}:</p><p><a href="${url.toString()}">Continue</a></p>`,
			}),
		});
		if (!response.ok) throw new Error("Authentication email delivery failed");
	}
}

export class AuthService {
	constructor(private readonly deps: Dependencies) {}

	async register(input: RegisterInput) {
		const existing = await this.deps.prisma.user.findUnique({ where: { email: input.email } });
		if (existing) throw new ConflictError("An account with this email already exists");
		const passwordHash = await this.deps.passwordService.hash(input.password);
		const token = newToken();
		let user;
		try {
			user = await this.deps.prisma.$transaction(async (tx) => {
				const created = await tx.user.create({ data: { email: input.email, displayName: input.displayName, passwordHash }, select: safeUser });
				await tx.authIdentity.create({ data: { userId: created.id, provider: "EMAIL", providerSubject: input.email } });
				await tx.authToken.create({ data: { userId: created.id, type: "EMAIL_VERIFICATION", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86400000) } });
				return created;
			});
		} catch (error) {
			if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
				throw new ConflictError("An account with this email already exists");
			}
			throw error;
		}
		await this.deps.authEmailService.send(input.email, "verify", token);
		return { user, verificationRequired: true };
	}

	async verifyEmail(token: string) {
		const record = await this.deps.prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
		if (!record || record.type !== "EMAIL_VERIFICATION" || record.consumedAt || record.expiresAt <= new Date()) throw new ValidationError("Invalid or expired verification token");
		await this.deps.prisma.$transaction(async (tx) => {
			const updated = await tx.authToken.updateMany({ where: { id: record.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
			if (!updated.count) throw new ValidationError("Verification token already used");
			await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
		});
		return { verified: true };
	}

	async issueSession(userId: string, userAgent?: string) {
		const token = newToken();
		const session = await this.deps.prisma.authSession.create({
			data: { userId, refreshTokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_MS), userAgent: userAgent?.slice(0, 512) },
		});
		return { accessToken: await this.accessToken(userId, session.id), refreshToken: token, expiresIn: 900 };
	}

	private async accessToken(userId: string, sessionId: string) {
		return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: "HS256" }).setSubject(userId)
			.setIssuer("supportai-api").setAudience("supportai").setIssuedAt().setExpirationTime("15m").sign(secret());
	}

	async login(email: string, password: string, userAgent?: string) {
		const user = await this.deps.prisma.user.findUnique({ where: { email } });
		if (!user?.passwordHash || !(await this.deps.passwordService.verify(user.passwordHash, password))) throw new AuthenticationError("Invalid credentials");
		if (!user.emailVerifiedAt) throw new AuthenticationError("Email verification required");
		return { user: { id: user.id, email: user.email, displayName: user.displayName, emailVerifiedAt: user.emailVerifiedAt }, ...await this.issueSession(user.id, userAgent) };
	}

	async refresh(token: string, userAgent?: string) {
		const oldHash = hashToken(token);
		const existing = await this.deps.prisma.authSession.findUnique({ where: { refreshTokenHash: oldHash } });
		if (!existing) throw new AuthenticationError("Invalid refresh token");
		if (existing.revokedAt) {
			await this.deps.prisma.authSession.updateMany({ where: { userId: existing.userId, revokedAt: null }, data: { revokedAt: new Date() } });
			throw new AuthenticationError("Refresh token reuse detected");
		}
		if (existing.expiresAt <= new Date()) throw new AuthenticationError("Refresh token expired");
		const next = newToken();
		const nextSessionId = randomUUID();
		try {
			await this.deps.prisma.$transaction(async (tx) => {
				const changed = await tx.authSession.updateMany({
					where: { id: existing.id, revokedAt: null, expiresAt: { gt: new Date() } },
					data: { revokedAt: new Date(), lastUsedAt: new Date() },
				});
				if (!changed.count) throw new AuthenticationError("Refresh token already used");
				await tx.authSession.create({
					data: {
						id: nextSessionId,
						userId: existing.userId,
						refreshTokenHash: hashToken(next),
						expiresAt: new Date(Date.now() + SESSION_MS),
						userAgent: userAgent?.slice(0, 512),
					},
				});
			});
		} catch (error) {
			if (error instanceof AuthenticationError) {
				await this.deps.prisma.authSession.updateMany({
					where: { userId: existing.userId, revokedAt: null },
					data: { revokedAt: new Date() },
				});
			}
			throw error;
		}
		return { accessToken: await this.accessToken(existing.userId, nextSessionId), refreshToken: next, expiresIn: 900 };
	}

	async authenticate(header?: string) {
		if (!header?.startsWith("Bearer ")) throw new AuthenticationError();
		try {
			const { payload } = await jwtVerify(header.slice(7), secret(), { issuer: "supportai-api", audience: "supportai", algorithms: ["HS256"] });
			if (!payload.sub || typeof payload.sid !== "string") throw new AuthenticationError();
			const session = await this.deps.prisma.authSession.findFirst({
				where: { id: payload.sid, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
				include: { user: { select: safeUser } },
			});
			if (!session || !session.user.emailVerifiedAt) throw new AuthenticationError();
			return { user: session.user, sessionId: session.id };
		} catch {
			throw new AuthenticationError();
		}
	}

	async logout(token: string) {
		await this.deps.prisma.authSession.updateMany({ where: { refreshTokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
		return { loggedOut: true };
	}

	async logoutAll(userId: string) {
		await this.deps.prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
		return { loggedOut: true };
	}

	async sendToken(email: string, purpose: "verify" | "reset") {
		const user = await this.deps.prisma.user.findUnique({ where: { email } });
		if (!user || (purpose === "verify" && user.emailVerifiedAt) || (purpose === "reset" && !user.passwordHash)) return { accepted: true };
		const type = purpose === "verify" ? "EMAIL_VERIFICATION" : "PASSWORD_RESET";
		const token = newToken();
		await this.deps.prisma.$transaction(async (tx) => {
			await tx.authToken.updateMany({ where: { userId: user.id, type, consumedAt: null }, data: { consumedAt: new Date() } });
			await tx.authToken.create({ data: { userId: user.id, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + (purpose === "verify" ? 86400000 : 3600000)) } });
		});
		await this.deps.authEmailService.send(email, purpose, token);
		return { accepted: true };
	}

	async resetPassword(token: string, password: string) {
		const record = await this.deps.prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
		if (!record || record.type !== "PASSWORD_RESET" || record.consumedAt || record.expiresAt <= new Date()) throw new ValidationError("Invalid or expired reset token");
		const passwordHash = await this.deps.passwordService.hash(password);
		await this.deps.prisma.$transaction(async (tx) => {
			const changed = await tx.authToken.updateMany({ where: { id: record.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
			if (!changed.count) throw new ValidationError("Reset token already used");
			await tx.user.update({ where: { id: record.userId }, data: { passwordHash, authVersion: { increment: 1 } } });
			await tx.authSession.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
		});
		return { reset: true };
	}
}
