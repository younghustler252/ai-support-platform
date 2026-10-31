import { z } from "zod";

import { permissionCatalog } from "../permission-catalog.js";

const name = z.string().trim().min(2).max(60);
const description = z.string().trim().max(300);
const permissions = z
	.array(z.string().trim().min(1).max(80))
	.min(1)
	.max(permissionCatalog.length)
	.transform((codes) => [...new Set(codes)]);

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
