import type { TenantRole } from "./tenancy.types.js";

export const roleRank: Record<TenantRole, number> = {
	MEMBER: 1,
	ADMIN: 2,
	OWNER: 3,
};

export function atLeast(role: TenantRole, minimum: TenantRole): boolean {
	return roleRank[role] >= roleRank[minimum];
}

export const organizationPolicy = {
	"organization.read": "MEMBER",
	"organization.update": "ADMIN",
	"organization.archive": "OWNER",
	"member.read": "MEMBER",
	"member.manage": "ADMIN",
	"invitation.manage": "ADMIN",
	"application.create": "ADMIN",
	"application.list": "MEMBER",
	"role.read": "ADMIN",
	"role.manage": "ADMIN",
	"role.assign": "ADMIN",
} as const satisfies Record<string, TenantRole>;

export type OrganizationAction = keyof typeof organizationPolicy;

interface ApplicationRule {
	minimum: TenantRole;
	organizationLevel?: boolean;
}

export const applicationPolicy = {
	"application.read": { minimum: "MEMBER" },
	"application.update": { minimum: "ADMIN" },
	"application.archive": { minimum: "ADMIN", organizationLevel: true },
	"application.member.read": { minimum: "MEMBER" },
	"application.member.manage": { minimum: "ADMIN" },
	"api-key.read": { minimum: "ADMIN" },
	"api-key.manage": { minimum: "ADMIN" },
	"application.role.read": { minimum: "ADMIN" },
	"application.role.manage": { minimum: "ADMIN" },
	"application.role.assign": { minimum: "ADMIN" },
	"customer.read": { minimum: "MEMBER" },
	"customer.manage": { minimum: "ADMIN" },
	"conversation.read": { minimum: "MEMBER" },
	"conversation.reply": { minimum: "MEMBER" },
	"conversation.claim": { minimum: "MEMBER" },
	"conversation.transfer": { minimum: "MEMBER" },
	"conversation.resolve": { minimum: "MEMBER" },
	"conversation.assign": { minimum: "ADMIN" },
	"knowledge.read": { minimum: "MEMBER" },
	"knowledge.manage": { minimum: "ADMIN" },
	"webhook.read": { minimum: "ADMIN" },
	"webhook.manage": { minimum: "ADMIN" },
} as const satisfies Record<string, ApplicationRule>;

export type ApplicationAction = keyof typeof applicationPolicy;
