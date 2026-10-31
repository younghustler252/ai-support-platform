import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid token");
const roleKey = z.enum(["OWNER", "ADMIN", "MEMBER"]);
const nonOwnerRole = z.enum(["ADMIN", "MEMBER"]);

export const organizationMemberParamsSchema = z.object({ organizationId: z.uuid(), userId: z.uuid() });
export const invitationParamsSchema = z.object({ organizationId: z.uuid(), invitationId: z.uuid() });
export const applicationMemberParamsSchema = z.object({
	organizationId: z.uuid(),
	applicationId: z.uuid(),
	userId: z.uuid(),
});

export const changeOrganizationMemberRoleSchema = z.strictObject({ role: roleKey });
export const createInvitationSchema = z.strictObject({ email, role: nonOwnerRole.default("MEMBER") });
export const acceptInvitationSchema = z.strictObject({ token });
export const addApplicationMemberSchema = z.strictObject({ userId: z.uuid(), role: nonOwnerRole.default("MEMBER") });
export const changeApplicationMemberRoleSchema = z.strictObject({ role: nonOwnerRole });

export type OrganizationMemberParams = z.output<typeof organizationMemberParamsSchema>;
export type InvitationParams = z.output<typeof invitationParamsSchema>;
export type ApplicationMemberParams = z.output<typeof applicationMemberParamsSchema>;
export type ChangeOrganizationMemberRoleInput = z.output<typeof changeOrganizationMemberRoleSchema>;
export type CreateInvitationInput = z.output<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.output<typeof acceptInvitationSchema>;
export type AddApplicationMemberInput = z.output<typeof addApplicationMemberSchema>;
export type ChangeApplicationMemberRoleInput = z.output<typeof changeApplicationMemberRoleSchema>;
