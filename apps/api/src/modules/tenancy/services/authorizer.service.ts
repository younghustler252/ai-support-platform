import { ForbiddenError, NotFoundError } from "../../../foundation/errors/app-error.js";
import { findPermission, scopeCovers } from "../../rbac/permission-catalog.js";
import type { ApplicationAction, OrganizationAction } from "../policies.js";
import { atLeast } from "../policies.js";
import type { IAccessRepository } from "../repositories/access.repository.interface.js";
import type { ApplicationAccess, OrganizationAccess, TenantRole } from "../tenancy.types.js";
import { applicationGrants, organizationGrants } from "./effective-grants.js";

export interface Authorizer {
	organization(userId: string, organizationId: string, action: OrganizationAction): Promise<OrganizationAccess>;
	application(
		userId: string,
		organizationId: string,
		applicationId: string,
		action: ApplicationAction,
	): Promise<ApplicationAccess>;
}

export class PermissionAuthorizer implements Authorizer {
	constructor(private readonly deps: { accessRepository: IAccessRepository }) {}

	async organization(userId: string, organizationId: string, action: OrganizationAction): Promise<OrganizationAccess> {
		const membership = await this.deps.accessRepository.findOrganizationMembership(userId, organizationId);
		if (!membership || membership.status !== "ACTIVE" || membership.organizationArchivedAt) {
			throw new NotFoundError("Organization not found");
		}

		const grants = organizationGrants(membership.role, membership.grants);
		const required = findPermission(action)?.requiredScope ?? "ALL";
		if (!scopeCovers(grants[action], required)) throw new ForbiddenError();
		return { organizationId, role: membership.role, grants };
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
		const applicationRole: TenantRole | null = record.applicationStatus === "ACTIVE" ? record.applicationRole : null;
		const grants = applicationGrants({
			organizationRole,
			organizationCustom: record.organizationGrants,
			applicationRole,
			applicationCustom: record.applicationGrants,
		});

		const reachable = atLeast(organizationRole, "ADMIN") || applicationRole !== null || Object.keys(grants).length > 0;
		if (!reachable) throw notFound;

		const required = findPermission(action)?.requiredScope ?? "ALL";
		if (!scopeCovers(grants[action], required)) throw new ForbiddenError();

		const viaOrganization = atLeast(organizationRole, "ADMIN");
		const role = viaOrganization ? organizationRole : (applicationRole ?? organizationRole);
		return { organizationId, applicationId, organizationRole, role, viaOrganization, grants };
	}
}
