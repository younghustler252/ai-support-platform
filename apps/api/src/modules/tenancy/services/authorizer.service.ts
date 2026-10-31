import { ForbiddenError, NotFoundError } from "../../../foundation/errors/app-error.js";
import {
	applicationPolicy,
	atLeast,
	organizationPolicy,
	type ApplicationAction,
	type OrganizationAction,
} from "../policies.js";
import type { IAccessRepository } from "../repositories/access.repository.interface.js";
import type { ApplicationAccess, OrganizationAccess, TenantRole } from "../tenancy.types.js";

export interface Authorizer {
	organization(userId: string, organizationId: string, action: OrganizationAction): Promise<OrganizationAccess>;
	application(
		userId: string,
		organizationId: string,
		applicationId: string,
		action: ApplicationAction,
	): Promise<ApplicationAccess>;
}

export class RoleAuthorizer implements Authorizer {
	constructor(private readonly deps: { accessRepository: IAccessRepository }) {}

	async organization(userId: string, organizationId: string, action: OrganizationAction): Promise<OrganizationAccess> {
		const membership = await this.deps.accessRepository.findOrganizationMembership(userId, organizationId);
		if (!membership || membership.status !== "ACTIVE" || membership.organizationArchivedAt) {
			throw new NotFoundError("Organization not found");
		}
		if (!atLeast(membership.role, organizationPolicy[action])) throw new ForbiddenError();
		return { organizationId, role: membership.role };
	}

	async application(
		userId: string,
		organizationId: string,
		applicationId: string,
		action: ApplicationAction,
	): Promise<ApplicationAccess> {
		const notFound = new NotFoundError("Application not found");
		const record = await this.deps.accessRepository.findApplicationAccess(userId, organizationId, applicationId);
		if (!record || record.archivedAt || record.organizationArchivedAt) throw notFound;
		if (!record.organizationRole || record.organizationStatus !== "ACTIVE") throw notFound;

		const organizationRole = record.organizationRole;
		const viaOrganization = atLeast(organizationRole, "ADMIN");
		const applicationRole: TenantRole | null = record.applicationStatus === "ACTIVE" ? record.applicationRole : null;
		const role = viaOrganization ? organizationRole : applicationRole;
		if (!role) throw notFound;

		const rule: { minimum: TenantRole; organizationLevel?: boolean } = applicationPolicy[action];
		if (rule.organizationLevel && !viaOrganization) throw new ForbiddenError();
		if (!atLeast(role, rule.minimum)) throw new ForbiddenError();

		return { organizationId, applicationId, organizationRole, role, viaOrganization };
	}
}
