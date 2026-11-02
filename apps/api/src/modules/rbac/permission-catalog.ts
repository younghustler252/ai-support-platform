import { applicationPolicy, organizationPolicy } from "../tenancy/policies.js";
import type { OrganizationAction, ApplicationAction } from "../tenancy/policies.js";

export type PermissionRealm = "ORGANIZATION" | "APPLICATION";
export type PermissionScopeName = "OWN" | "ASSIGNED" | "TEAM" | "APPLICATION" | "ORGANIZATION" | "ALL";

export const scopeRank: Record<PermissionScopeName, number> = {
	OWN: 1,
	ASSIGNED: 2,
	TEAM: 3,
	APPLICATION: 4,
	ORGANIZATION: 5,
	ALL: 6,
};

export function scopeCovers(granted: PermissionScopeName | undefined, required: PermissionScopeName): boolean {
	return granted !== undefined && scopeRank[granted] >= scopeRank[required];
}

export function widestScope(
	first: PermissionScopeName | undefined,
	second: PermissionScopeName | undefined,
): PermissionScopeName | undefined {
	if (!first) return second;
	if (!second) return first;
	return scopeRank[first] >= scopeRank[second] ? first : second;
}

export interface PermissionDefinition {
	code: string;
	realm: PermissionRealm;
	description: string;
	delegable: boolean;
	requiredScope: PermissionScopeName;
	narrowScopes: PermissionScopeName[];
}

const organizationDescriptions: Record<OrganizationAction, string> = {
	"organization.read": "View organization details",
	"organization.update": "Edit organization details",
	"organization.archive": "Archive the organization",
	"member.read": "View organization members",
	"member.manage": "Change roles of and remove organization members",
	"invitation.manage": "Invite people and manage pending invitations",
	"application.create": "Create applications",
	"application.list": "List applications",
	"role.read": "View organization roles and their assignments",
	"role.manage": "Create, edit and delete organization roles",
	"role.assign": "Assign organization roles to members",
};

const applicationDescriptions: Record<ApplicationAction, string> = {
	"application.read": "View application details",
	"application.update": "Edit application settings",
	"application.archive": "Archive an application",
	"application.member.read": "View application members",
	"application.member.manage": "Add, change and remove application members",
	"api-key.read": "View API keys",
	"api-key.manage": "Create, rotate and revoke API keys",
	"application.role.read": "View application roles and their assignments",
	"application.role.manage": "Create, edit and delete application roles",
	"application.role.assign": "Assign application roles to members",
	"customer.read": "View customers",
	"customer.manage": "Edit customer details",
	"conversation.read": "View conversations and their messages",
	"conversation.reply": "Reply to customers and add internal notes",
	"conversation.claim": "Take unassigned conversations",
	"conversation.transfer": "Release or transfer conversations to another agent",
	"conversation.resolve": "Resolve, reopen and close conversations",
	"conversation.assign": "Assign conversations to any agent",
	"knowledge.read": "View knowledge base articles",
	"knowledge.manage": "Create, edit, publish and delete knowledge base articles",
};

const narrowScopesByCode: Record<string, PermissionScopeName[]> = {
	"conversation.read": ["ASSIGNED"],
	"conversation.reply": ["ASSIGNED"],
	"conversation.transfer": ["ASSIGNED"],
	"conversation.resolve": ["ASSIGNED"],
};

const nonDelegable = new Set<string>(["organization.archive", "application.archive"]);

export const permissionCatalog: readonly PermissionDefinition[] = [
	...(Object.keys(organizationPolicy) as OrganizationAction[]).map((code) => ({
		code,
		realm: "ORGANIZATION" as const,
		description: organizationDescriptions[code],
		delegable: !nonDelegable.has(code),
		requiredScope: "ORGANIZATION" as const,
		narrowScopes: [] as PermissionScopeName[],
	})),
	...(Object.keys(applicationPolicy) as ApplicationAction[]).map((code) => ({
		code,
		realm: "APPLICATION" as const,
		description: applicationDescriptions[code],
		delegable: !nonDelegable.has(code),
		requiredScope: (narrowScopesByCode[code]?.[0] ?? "APPLICATION") as PermissionScopeName,
		narrowScopes: narrowScopesByCode[code] ?? [],
	})),
];

const byCode = new Map(permissionCatalog.map((definition) => [definition.code, definition]));

export function findPermission(code: string): PermissionDefinition | undefined {
	return byCode.get(code);
}

export type RoleRealm = PermissionRealm;

export function grantScopeFor(
	roleRealm: RoleRealm,
	permission: PermissionDefinition,
	requested?: PermissionScopeName,
): PermissionScopeName | null {
	const wide: PermissionScopeName | null =
		roleRealm === "ORGANIZATION" ? "ORGANIZATION" : permission.realm === "APPLICATION" ? "APPLICATION" : null;
	if (!wide) return null;
	if (requested === undefined || requested === wide) return wide;
	return permission.narrowScopes.includes(requested) ? requested : null;
}

export function allowedGrantScopes(roleRealm: RoleRealm, permission: PermissionDefinition): PermissionScopeName[] {
	const wide = grantScopeFor(roleRealm, permission);
	return wide ? [...permission.narrowScopes, wide] : [];
}

export interface SystemRoleDefinition {
	key: string;
	name: string;
	realm: RoleRealm;
	description: string;
	permissions: Array<{ code: string; scope: PermissionScopeName }>;
}

const tierRank = { MEMBER: 1, ADMIN: 2, OWNER: 3 } as const;

function permissionsAtLeast(realm: PermissionRealm, tier: keyof typeof tierRank) {
	const source: Record<string, string | { minimum: string }> = realm === "ORGANIZATION" ? organizationPolicy : applicationPolicy;
	return permissionCatalog
		.filter((definition) => definition.realm === realm)
		.filter((definition) => {
			const rule = source[definition.code];
			const minimum = (typeof rule === "string" ? rule : rule?.minimum) as keyof typeof tierRank;
			return tierRank[tier] >= tierRank[minimum];
		})
		.map((definition) => ({ code: definition.code, scope: definition.requiredScope }));
}

export const systemRoles: readonly SystemRoleDefinition[] = [
	{ key: "organization-owner", name: "Owner", realm: "ORGANIZATION", description: "Full control of the organization", permissions: [...permissionsAtLeast("ORGANIZATION", "OWNER"), ...permissionsAtLeast("APPLICATION", "OWNER").map((item) => ({ ...item, scope: "ORGANIZATION" as const }))] },
	{ key: "organization-admin", name: "Admin", realm: "ORGANIZATION", description: "Manages the organization and all of its applications", permissions: [...permissionsAtLeast("ORGANIZATION", "ADMIN"), ...permissionsAtLeast("APPLICATION", "ADMIN").map((item) => ({ ...item, scope: "ORGANIZATION" as const }))] },
	{ key: "organization-member", name: "Member", realm: "ORGANIZATION", description: "Read-only access to the organization", permissions: permissionsAtLeast("ORGANIZATION", "MEMBER") },
	{ key: "application-admin", name: "Admin", realm: "APPLICATION", description: "Manages a single application", permissions: permissionsAtLeast("APPLICATION", "ADMIN") },
	{ key: "application-member", name: "Member", realm: "APPLICATION", description: "Read-only access to a single application", permissions: permissionsAtLeast("APPLICATION", "MEMBER") },
];
