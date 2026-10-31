import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { TenantRole } from "../../tenancy/tenancy.types.js";
import type { IOrganizationRepository, OrganizationWithRole } from "../repositories/organization.repository.interface.js";

export class GetOrganizationUseCase {
	constructor(private readonly deps: { organizationRepository: IOrganizationRepository }) {}

	async execute(organizationId: string, role: TenantRole): Promise<OrganizationWithRole> {
		const organization = await this.deps.organizationRepository.findById(organizationId);
		if (!organization) throw new NotFoundError("Organization not found");
		return { ...organization, role };
	}
}
