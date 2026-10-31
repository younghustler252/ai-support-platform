import { Router } from "express";

import { tenancyConfig } from "../../../config/tenancy.js";
import { delegate } from "../../../foundation/http/locals.js";
import { rateLimit } from "../../../foundation/middleware/rate-limit.js";
import { validateBody, validateParams } from "../../../foundation/validation/validate.js";
import { requireAuth } from "../../auth/middleware/require-auth.js";
import { userRateKey } from "../../tenancy/http/tenant-http.js";
import { requireApplication, requireOrganization } from "../../tenancy/middleware/tenant-access.js";
import type { MembershipController } from "../controllers/membership.controller.js";
import {
	acceptInvitationSchema,
	addApplicationMemberSchema,
	applicationMemberParamsSchema,
	changeApplicationMemberRoleSchema,
	changeOrganizationMemberRoleSchema,
	createInvitationSchema,
	invitationParamsSchema,
	organizationMemberParamsSchema,
} from "../validators/membership.validator.js";

const createInvitationLimit = rateLimit({
	name: "invitation:create:user",
	...tenancyConfig.rateLimits.createInvitation,
	key: userRateKey,
});
const acceptInvitationLimit = rateLimit({
	name: "invitation:accept:user",
	...tenancyConfig.rateLimits.acceptInvitation,
	key: userRateKey,
});

const handle = (method: Parameters<typeof delegate<MembershipController>>[1]) =>
	delegate<MembershipController>("membershipController", method);

export function membershipRouter(): Router {
	const router = Router();
	const organizationBase = "/organizations/:organizationId";
	const applicationBase = `${organizationBase}/applications/:applicationId`;

	router.get(`${organizationBase}/members`, requireAuth, requireOrganization("member.read"), handle("listMembers"));
	router.patch(
		`${organizationBase}/members/:userId`,
		requireAuth,
		requireOrganization("member.manage"),
		validateParams(organizationMemberParamsSchema),
		validateBody(changeOrganizationMemberRoleSchema),
		handle("changeMemberRole"),
	);
	router.delete(
		`${organizationBase}/members/:userId`,
		requireAuth,
		requireOrganization("organization.read"),
		validateParams(organizationMemberParamsSchema),
		handle("removeMember"),
	);

	router.post(
		`${organizationBase}/invitations`,
		requireAuth,
		requireOrganization("invitation.manage"),
		validateBody(createInvitationSchema),
		createInvitationLimit,
		handle("createInvitation"),
	);
	router.get(`${organizationBase}/invitations`, requireAuth, requireOrganization("invitation.manage"), handle("listInvitations"));
	router.delete(
		`${organizationBase}/invitations/:invitationId`,
		requireAuth,
		requireOrganization("invitation.manage"),
		validateParams(invitationParamsSchema),
		handle("revokeInvitation"),
	);
	router.post("/invitations/accept", requireAuth, validateBody(acceptInvitationSchema), acceptInvitationLimit, handle("acceptInvitation"));

	router.get(`${applicationBase}/members`, requireAuth, requireApplication("application.member.read"), handle("listApplicationMembers"));
	router.post(
		`${applicationBase}/members`,
		requireAuth,
		requireApplication("application.member.manage"),
		validateBody(addApplicationMemberSchema),
		handle("addApplicationMember"),
	);
	router.patch(
		`${applicationBase}/members/:userId`,
		requireAuth,
		requireApplication("application.member.manage"),
		validateParams(applicationMemberParamsSchema),
		validateBody(changeApplicationMemberRoleSchema),
		handle("changeApplicationMemberRole"),
	);
	router.delete(
		`${applicationBase}/members/:userId`,
		requireAuth,
		requireApplication("application.member.manage"),
		validateParams(applicationMemberParamsSchema),
		handle("removeApplicationMember"),
	);

	return router;
}
