import { randomBytes, createHash } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { ConflictError } from "../../../foundation/errors/app-error.js";
import type { PasswordService } from "../services/password.service.js";
import type { RegisterInput } from "../validators/auth.validator.js";

interface Dependencies {
	prisma: PrismaClient;
	passwordService: PasswordService;
}

export class RegisterUseCase {
	constructor(private readonly deps: Dependencies) {}

	async execute(input: RegisterInput) {
		const passwordHash = await this.deps.passwordService.hash(input.password);
		const verificationToken = randomBytes(32).toString("base64url");
		const tokenHash = createHash("sha256").update(verificationToken).digest("hex");
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

		try {
			const user = await this.deps.prisma.$transaction(async (tx) => {
				const created = await tx.user.create({
					data: {
						email: input.email,
						displayName: input.displayName,
						passwordHash,
					},
					select: {
						id: true,
						email: true,
						displayName: true,
						emailVerifiedAt: true,
					},
				});

				await tx.authIdentity.create({
					data: {
						userId: created.id,
						provider: "EMAIL",
						providerSubject: input.email,
					},
				});

				await tx.authToken.create({
					data: {
						userId: created.id,
						type: "EMAIL_VERIFICATION",
						tokenHash,
						expiresAt,
					},
				});

				return created;
			});

			// The token is intentionally never included in the HTTP response.
			// A delivery adapter will consume it in the email-verification stage.
			return { user, verificationRequired: true, verificationToken };
		} catch (error) {
			if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
				throw new ConflictError("An account with this email already exists");
			}

			throw error;
		}
	}
}
