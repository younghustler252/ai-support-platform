import { reservedSlugs, tenancyConfig } from "../../../config/tenancy.js";
import { ConflictError, LimitExceededError } from "../../../foundation/errors/app-error.js";
import { slugify, withRandomSuffix } from "../../../foundation/utils/slug.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { isUniqueViolation } from "../../auth/auth.utils.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { ApplicationView, IApplicationRepository } from "../repositories/application.repository.interface.js";

const MAX_GENERATED_ATTEMPTS = 4;

interface Input {
	organizationId: string;
	actorId: string;
	name: string;
	slug?: string;
	description?: string;
	allowedOrigins: string[];
}

export class CreateApplicationUseCase {
	constructor(private readonly deps: { applicationRepository: IApplicationRepository; auditService: AuditRecorder }) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<ApplicationView> {
		const { applicationRepository, auditService } = this.deps;

		if ((await applicationRepository.countActive(input.organizationId)) >= tenancyConfig.limits.applicationsPerOrganization) {
			throw new LimitExceededError("This organization has reached its application limit");
		}

		const generated = input.slug === undefined;
		let candidate = input.slug ?? slugify(input.name, "application");
		if (generated && reservedSlugs.includes(candidate)) candidate = withRandomSuffix(candidate);

		for (let attempt = 1; ; attempt += 1) {
			try {
				const application = await applicationRepository.create({
					organizationId: input.organizationId,
					name: input.name,
					slug: candidate,
					description: input.description,
					allowedOrigins: input.allowedOrigins,
				});
				await auditService.record({
					actorUserId: input.actorId,
					action: "application.created",
					resourceType: "Application",
					resourceId: application.id,
					metadata: auditMetadata(meta, { organizationId: input.organizationId, applicationId: application.id }),
				});
				return application;
			} catch (error) {
				if (!isUniqueViolation(error)) throw error;
				if (!generated) throw new ConflictError("This slug is already used by another application in the organization");
				if (attempt >= MAX_GENERATED_ATTEMPTS) throw new ConflictError("Could not generate a unique slug; please choose one");
				candidate = withRandomSuffix(slugify(input.name, "application"));
			}
		}
	}
}
