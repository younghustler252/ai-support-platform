import { reservedSlugs, tenancyConfig } from "../../../config/tenancy.js";
import { ConflictError, LimitExceededError } from "../../../foundation/errors/app-error.js";
import { slugify, withRandomSuffix } from "../../../foundation/utils/slug.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { isUniqueViolation } from "../../auth/auth.utils.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { IOrganizationRepository, OrganizationWithRole } from "../repositories/organization.repository.interface.js";

const MAX_GENERATED_ATTEMPTS = 4;

export class CreateOrganizationUseCase {
	constructor(private readonly deps: { organizationRepository: IOrganizationRepository; auditService: AuditRecorder }) {}

	async execute(
		input: { userId: string; name: string; slug?: string },
		meta: RequestMeta = {},
	): Promise<OrganizationWithRole> {
		const { organizationRepository, auditService } = this.deps;

		if ((await organizationRepository.countOwnedBy(input.userId)) >= tenancyConfig.limits.ownedOrganizationsPerUser) {
			throw new LimitExceededError("You have reached the maximum number of organizations");
		}

		const generated = input.slug === undefined;
		let candidate = input.slug ?? slugify(input.name, "organization");
		if (generated && reservedSlugs.includes(candidate)) candidate = withRandomSuffix(candidate);

		for (let attempt = 1; ; attempt += 1) {
			try {
				const organization = await organizationRepository.createWithOwner({
					name: input.name,
					slug: candidate,
					userId: input.userId,
				});
				await auditService.record({
					actorUserId: input.userId,
					action: "organization.created",
					resourceType: "Organization",
					resourceId: organization.id,
					metadata: auditMetadata(meta, { organizationId: organization.id }),
				});
				return { ...organization, role: "OWNER" };
			} catch (error) {
				if (!isUniqueViolation(error)) throw error;
				if (!generated) throw new ConflictError("This slug is already in use");
				if (attempt >= MAX_GENERATED_ATTEMPTS) throw new ConflictError("Could not generate a unique slug; please choose one");
				candidate = withRandomSuffix(slugify(input.name, "organization"));
			}
		}
	}
}
