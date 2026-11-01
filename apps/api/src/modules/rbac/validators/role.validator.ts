import { z } from "zod";

import { permissionCatalog } from "../permission-catalog.js";

const name = z.string().trim().min(2).max(60);
const description = z.string().trim().max(300);
const scope = z.enum(["ASSIGNED", "APPLICATION", "ORGANIZATION"]);
const permissionRequest = z.union([
	z.string().trim().min(1).max(80),
	z.strictObject({ code: z.string().trim().min(1).max(80), scope: scope.optional() }),
]);
const permissions = z.array(permissionRequest).min(1).max(permissionCatalog.length * 2);

export const createRoleSchema = z.strictObject({
	name,
	description: description.optional(),
	permissions,
});

export const updateRoleSchema = z
	.strictObject({
		name: name.optional(),
		description: description.nullable().optional(),
		permissions: permissions.optional(),
	})
	.refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const roleParamsSchema = z.object({
	organizationId: z.uuid(),
	applicationId: z.uuid().optional(),
	roleId: z.uuid(),
});

export const roleAssignmentParamsSchema = roleParamsSchema.extend({ userId: z.uuid() });

export type CreateRoleInput = z.output<typeof createRoleSchema>;
export type UpdateRoleInput = z.output<typeof updateRoleSchema>;
export type RoleParams = z.output<typeof roleParamsSchema>;
export type RoleAssignmentParams = z.output<typeof roleAssignmentParamsSchema>;
